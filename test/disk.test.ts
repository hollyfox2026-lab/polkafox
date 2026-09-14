import { describe, expect, it } from "vitest";
import { createYandexDiskClient, YandexDiskError } from "../src/yandex/disk";
import { APP_FOLDER, CATALOG_NAME, YANDEX_DISK_API } from "../src/yandex/config";
import type { Shoe } from "../src/types";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function shoe(): Shoe {
  return {
    id: "s1",
    name: "Кеды",
    brand: "Fox",
    size: "38",
    type: "sneakers",
    color: "белые",
    seasons: ["summer"],
    description: "на каждый день",
    photo: "data:image/jpeg;base64,aGk=",
    createdAt: 1,
    updatedAt: 2,
    deletedAt: null,
  };
}

describe("Yandex Disk client", () => {
  it("пишет каталог в app:/ без JSON Content-Type на загрузчик", async () => {
    const calls: Array<{ url: string; method: string; body?: string; contentType?: string | null }> =
      [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body = typeof init?.body === "string" ? init.body : undefined;
      calls.push({ url, method, body, contentType: headers.get("Content-Type") });

      if (url.startsWith(YANDEX_DISK_API) && url.includes("/resources?") && method === "GET") {
        return jsonResponse({ type: "dir", name: "app" });
      }
      if (url.includes("/resources/upload")) {
        expect(headers.get("Authorization")).toBe("OAuth token");
        expect(url).not.toContain("oauth_token=");
        return jsonResponse({ href: "https://uploader.test/put", method: "PUT" });
      }
      if (url === "https://uploader.test/put") {
        return new Response(null, { status: 201 });
      }
      throw new Error(`unexpected ${method} ${url}`);
    };

    const client = createYandexDiskClient("token", fetchImpl);
    await client.uploadCatalog([shoe()]);

    const uploadLink = calls.find((call) => call.url.includes("/resources/upload"));
    expect(uploadLink?.url).toContain(encodeURIComponent(`${APP_FOLDER}${CATALOG_NAME}`));
    expect(uploadLink?.url).toContain("overwrite=true");
    expect(uploadLink?.url).not.toContain("oauth_token=");

    const put = calls.find((call) => call.url === "https://uploader.test/put");
    expect(put?.method).toBe("PUT");
    expect(put?.contentType).toBe("text/plain;charset=UTF-8");
    expect(put?.body).not.toContain("data:image/jpeg;base64");
    expect(put?.body).toContain('"hasPhoto":true');
    expect(put?.body).toContain("Кеды");
  });

  it("пишет фото отдельным файлом без Content-Type", async () => {
    const calls: Array<{ url: string; method: string; contentType?: string | null; bodyKind?: string }> =
      [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      const headers = new Headers(init?.headers);
      const body = init?.body;
      calls.push({
        url,
        method,
        contentType: headers.get("Content-Type"),
        bodyKind: body instanceof ArrayBuffer ? "buffer" : typeof body,
      });
      if (url.startsWith(YANDEX_DISK_API) && url.includes("/resources?") && method === "GET") {
        return jsonResponse({ type: "dir" });
      }
      if (url.includes("/resources/upload")) {
        expect(url).toContain(encodeURIComponent("app:/photos/s1.jpg"));
        return jsonResponse({ href: "https://uploader.test/photo", method: "PUT" });
      }
      if (url === "https://uploader.test/photo") {
        return new Response(null, { status: 201 });
      }
      throw new Error(`unexpected ${method} ${url}`);
    };

    const client = createYandexDiskClient("token", fetchImpl);
    await client.uploadPhoto("s1", "data:image/jpeg;base64,aGk=");
    const put = calls.find((call) => call.url === "https://uploader.test/photo");
    expect(put?.method).toBe("PUT");
    expect(put?.contentType).toBeNull();
    expect(put?.bodyKind).toBe("buffer");
  });

  it("скачивает фото и возвращает data URL", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/resources?") && !url.includes("download") && method === "GET") {
        return jsonResponse({ type: "dir" });
      }
      if (url.includes("/resources/download")) {
        expect(url).toContain(encodeURIComponent("app:/photos/s1.jpg"));
        return jsonResponse({ href: "https://downloader.test/photo", method: "GET" });
      }
      if (url === "https://downloader.test/photo") {
        return new Response(new Uint8Array([104, 105]), {
          status: 200,
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      throw new Error(`unexpected ${method} ${url}`);
    };
    const client = createYandexDiskClient("token", fetchImpl);
    await expect(client.downloadPhoto("s1")).resolves.toBe("data:image/jpeg;base64,aGk=");
  });

  it("скачивает каталог по одноразовой ссылке", async () => {
    const catalog = {
      version: 1,
      updatedAt: 2,
      items: [shoe()],
    };
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/resources?") && !url.includes("download") && method === "GET") {
        return jsonResponse({ type: "dir" });
      }
      if (url.includes("/resources/download")) {
        return jsonResponse({ href: "https://downloader.test/file", method: "GET" });
      }
      if (url === "https://downloader.test/file") {
        return new Response(JSON.stringify(catalog), { status: 200 });
      }
      throw new Error(`unexpected ${method} ${url}`);
    };

    const client = createYandexDiskClient("token", fetchImpl);
    const downloaded = await client.downloadCatalog();
    expect(downloaded?.items[0].name).toBe("Кеды");
    expect(downloaded?.items[0].photo).toBe("data:image/jpeg;base64,aGk=");
  });

  it("считает отсутствующий файл пустым каталогом", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const method = (init?.method ?? "GET").toUpperCase();
      if (url.includes("/resources?") && !url.includes("download") && method === "GET") {
        return jsonResponse({ type: "dir" });
      }
      if (url.includes("/resources/download")) return jsonResponse({ error: "DiskNotFoundError" }, 404);
      throw new Error(`unexpected ${method} ${url}`);
    };
    const client = createYandexDiskClient("token", fetchImpl);
    expect(await client.downloadCatalog()).toBeNull();
  });

  it("читает имя пользователя из /v1/disk", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      expect(url).toBe(`${YANDEX_DISK_API}`);
      expect(headers.get("Authorization")).toBe("OAuth token");
      expect(init?.credentials).toBe("omit");
      return jsonResponse({ user: { login: "fox", display_name: "Лиса" } });
    };
    const client = createYandexDiskClient("token", fetchImpl);
    await expect(client.getUser()).resolves.toEqual({ login: "fox", displayName: "Лиса" });
  });

  it("при 401 повторяет запрос с Bearer, затем с oauth_token", async () => {
    const schemes: string[] = [];
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      schemes.push(headers.get("Authorization") ?? "");
      urls.push(String(input));
      if (schemes.length < 3) return jsonResponse({ message: "Unauthorized" }, 401);
      expect(String(input)).toContain("oauth_token=tok");
      return jsonResponse({ user: { login: "fox", display_name: "Лиса" } });
    };
    const client = createYandexDiskClient("tok", fetchImpl);
    await expect(client.getUser()).resolves.toEqual({ login: "fox", displayName: "Лиса" });
    expect(schemes).toEqual(["OAuth tok", "Bearer tok", ""]);
    expect(urls[2]).toContain("oauth_token=tok");
  });

  it("в обычном браузере после сбоя заголовка берёт oauth_token", async () => {
    const urls: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      urls.push(url);
      const headers = new Headers(init?.headers);
      if (headers.get("Authorization")) throw new Error("Failed to fetch");
      expect(url).toContain("oauth_token=tok");
      return jsonResponse({ user: { login: "fox", display_name: "Лиса" } });
    };
    const client = createYandexDiskClient("tok", fetchImpl);
    await expect(client.getUser()).resolves.toEqual({ login: "fox", displayName: "Лиса" });
    expect(urls[0]).toBe(`${YANDEX_DISK_API}`);
    expect(urls.at(-1)).toContain("oauth_token=tok");
  });

  it("на изолированном значке сразу шлёт oauth_token", async () => {
    const fetchImpl: typeof fetch = async (input, init) => {
      expect(String(input)).toContain("oauth_token=tok");
      expect(new Headers(init?.headers).get("Authorization")).toBeNull();
      return jsonResponse({ user: { login: "fox", display_name: "Лиса" } });
    };
    const client = createYandexDiskClient("tok", fetchImpl, { isolated: true });
    await expect(client.getUser()).resolves.toEqual({ login: "fox", displayName: "Лиса" });
  });

  it("пробрасывает 401, если оба заголовка отклонены", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ message: "Unauthorized" }, 401);
    const client = createYandexDiskClient("bad", fetchImpl);
    await expect(client.getUser()).rejects.toBeInstanceOf(YandexDiskError);
  });

  it("превращает Load failed в ошибку Диска", async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new Error("Load failed");
    };
    const client = createYandexDiskClient("tok", fetchImpl);
    await expect(client.getUser()).rejects.toMatchObject({
      name: "YandexDiskError",
      code: "network",
    });
  });
});
