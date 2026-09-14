import { APP_FOLDER, CATALOG_NAME, FALLBACK_FOLDER, PHOTOS_DIR, YANDEX_DISK_API } from "./config";
import type { CatalogFile } from "../types";
import { parseCatalog, toDiskCatalog } from "../catalog";
import type { Shoe } from "../types";

export interface DiskUser {
  login: string;
  displayName: string;
}

export interface DiskLink {
  href: string;
  method: string;
}

export interface YandexDiskClient {
  getUser(): Promise<DiskUser>;
  ensureFolder(): Promise<string>;
  downloadCatalog(): Promise<CatalogFile | null>;
  uploadCatalog(items: Shoe[]): Promise<void>;
  downloadPhoto(id: string): Promise<string | null>;
  uploadPhoto(id: string, dataUrl: string): Promise<void>;
}

interface DiskErrorBody {
  error?: string;
  description?: string;
  message?: string;
}

export class YandexDiskError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "YandexDiskError";
    this.status = status;
    this.code = code;
  }
}

function folderRoot(folder: string): string {
  return folder.endsWith("/") ? folder : `${folder}/`;
}

function catalogPath(folder: string): string {
  return `${folderRoot(folder)}${CATALOG_NAME}`;
}

function photosDir(folder: string): string {
  return `${folderRoot(folder)}${PHOTOS_DIR}`;
}

function photoPath(folder: string, id: string): string {
  return `${photosDir(folder)}/${id}.jpg`;
}

export function dataUrlToBlob(dataUrl: string): Blob {
  const data = dataUrl.split(",")[1];
  if (!data) throw new Error("Фото повреждено: нет данных.");
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  // Пустой MIME: иначе PUT image/jpeg вызывает CORS preflight и запись с телефона падает.
  return new Blob([bytes]);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const mime = blob.type || "image/jpeg";
  return `data:${mime};base64,${btoa(binary)}`;
}

export function createYandexDiskClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): YandexDiskClient {
  let root: string | null = null;
  let authScheme: "OAuth" | "Bearer" = "OAuth";

  async function api(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `${authScheme} ${token}`);
    headers.set("Accept", "application/json");
    if (init.body != null) headers.set("Content-Type", "application/json");
    const response = await fetchImpl(`${YANDEX_DISK_API}${path}`, { ...init, headers });
    if (response.status === 401 && authScheme === "OAuth") {
      authScheme = "Bearer";
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set("Authorization", `Bearer ${token}`);
      retryHeaders.set("Accept", "application/json");
      if (init.body != null) retryHeaders.set("Content-Type", "application/json");
      return fetchImpl(`${YANDEX_DISK_API}${path}`, { ...init, headers: retryHeaders });
    }
    return response;
  }

  async function readError(response: Response): Promise<YandexDiskError> {
    let body: DiskErrorBody | null = null;
    try {
      body = (await response.json()) as DiskErrorBody;
    } catch {
      body = null;
    }
    const message =
      body?.message ||
      body?.description ||
      body?.error ||
      `Яндекс Диск вернул ошибку ${response.status}.`;
    return new YandexDiskError(message, response.status, body?.error);
  }

  async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await api(path, init);
    if (!response.ok) throw await readError(response);
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  async function probeFolder(path: string): Promise<boolean> {
    const encoded = encodeURIComponent(path);
    const response = await api(`/resources?path=${encoded}`);
    if (response.ok) return true;
    if (response.status === 404) {
      const created = await api(`/resources?path=${encoded}`, { method: "PUT" });
      return created.ok || created.status === 409;
    }
    if (response.status === 403) return false;
    if (response.status === 401) throw await readError(response);
    throw await readError(response);
  }

  async function putToUploader(href: string, body: Blob | string): Promise<void> {
    // text/plain — CORS-safelist; JSON и image/* на загрузчике вызывают preflight.
    const uploaded = await fetchImpl(
      href,
      typeof body === "string"
        ? {
            method: "PUT",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body,
          }
        : { method: "PUT", body: await body.arrayBuffer() },
    );
    if (!uploaded.ok && uploaded.status !== 201 && uploaded.status !== 202) {
      throw new YandexDiskError("Не удалось сохранить файл на Диск.", uploaded.status);
    }
  }

  async function downloadByPath(path: string): Promise<Response | null> {
    const meta = await api(`/resources/download?path=${encodeURIComponent(path)}`);
    if (meta.status === 404) return null;
    if (!meta.ok) throw await readError(meta);
    const link = (await meta.json()) as DiskLink;
    const file = await fetchImpl(link.href);
    if (file.status === 404) return null;
    if (!file.ok) {
      throw new YandexDiskError("Не удалось скачать файл с Диска.", file.status);
    }
    return file;
  }

  return {
    async getUser() {
      const info = await apiJson<{ user?: { login?: string; display_name?: string } }>("");
      return {
        login: info.user?.login ?? "",
        displayName: info.user?.display_name || info.user?.login || "Яндекс",
      };
    },

    async ensureFolder() {
      if (root) return root;
      if (await probeFolder(APP_FOLDER)) {
        root = APP_FOLDER;
      } else if (await probeFolder(FALLBACK_FOLDER)) {
        root = FALLBACK_FOLDER;
      } else {
        throw new YandexDiskError(
          "Нет доступа к папке приложения на Диске. Проверьте права cloud_api:disk.app_folder или чтение/запись.",
          403,
        );
      }
      await probeFolder(photosDir(root));
      return root;
    },

    async downloadCatalog() {
      const folder = await this.ensureFolder();
      const file = await downloadByPath(catalogPath(folder));
      if (!file) return null;
      const text = await file.text();
      if (!text.trim()) return { version: 2, updatedAt: 0, items: [] };
      return parseCatalog(JSON.parse(text) as unknown);
    },

    async uploadCatalog(items) {
      const folder = await this.ensureFolder();
      const path = encodeURIComponent(catalogPath(folder));
      const link = await apiJson<DiskLink>(`/resources/upload?path=${path}&overwrite=true`);
      await putToUploader(link.href, JSON.stringify(toDiskCatalog(items)));
    },

    async downloadPhoto(id) {
      const folder = await this.ensureFolder();
      const file = await downloadByPath(photoPath(folder, id));
      if (!file) return null;
      return blobToDataUrl(await file.blob());
    },

    async uploadPhoto(id, dataUrl) {
      const folder = await this.ensureFolder();
      const path = encodeURIComponent(photoPath(folder, id));
      const link = await apiJson<DiskLink>(`/resources/upload?path=${path}&overwrite=true`);
      await putToUploader(link.href, dataUrlToBlob(dataUrl));
    },
  };
}
