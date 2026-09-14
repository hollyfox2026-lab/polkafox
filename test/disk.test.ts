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
    photo: "data:image/jpeg;base64,qq",
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
        expect(headers.get("Authorization")).toMatch(/^OAuth /);
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

    const put = calls.find((call) => call.url === "https://uploader.test/put");
    expect(put?.method).toBe("PUT");
    expect(put?.contentType).toBe("text/plain;charset=UTF-8");
    expect(put?.body).toContain("data:image/jpeg;base64,qq");
    expect(put?.body).toContain("Кеды");
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
    expect(downloaded?.items[0].photo).toBe("data:image/jpeg;base64,qq");
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
    const fetchImpl: typeof fetch = async (input) => {
      if (String(input) === `${YANDEX_DISK_API}`) {
        return jsonResponse({ user: { login: "fox", display_name: "Лиса" } });
      }
      throw new Error(String(input));
    };
    const client = createYandexDiskClient("token", fetchImpl);
    await expect(client.getUser()).resolves.toEqual({ login: "fox", displayName: "Лиса" });
  });

  it("при 401 повторяет запрос с Bearer", async () => {
    const schemes: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const headers = new Headers(init?.headers);
      schemes.push(headers.get("Authorization") ?? "");
      if (schemes.length === 1) return jsonResponse({ message: "Unauthorized" }, 401);
      if (String(input) === `${YANDEX_DISK_API}`) {
        return jsonResponse({ user: { login: "fox", display_name: "Лиса" } });
      }
      throw new Error(String(input));
    };
    const client = createYandexDiskClient("tok", fetchImpl);
    await expect(client.getUser()).resolves.toEqual({ login: "fox", displayName: "Лиса" });
    expect(schemes[0]).toBe("OAuth tok");
    expect(schemes[1]).toBe("Bearer tok");
  });

  it("пробрасывает 401, если оба заголовка отклонены", async () => {
    const fetchImpl: typeof fetch = async () => jsonResponse({ message: "Unauthorized" }, 401);
    const client = createYandexDiskClient("bad", fetchImpl);
    await expect(client.getUser()).rejects.toBeInstanceOf(YandexDiskError);
  });
});
