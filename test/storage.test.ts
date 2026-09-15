import { describe, expect, it, vi } from "vitest";
import {
  createStorage,
  YandexObjectStorage,
  type ObjectStorageClient,
} from "../src/storage.js";

const baseYandexConfig = {
  accessKeyId: "test-key-id",
  secretAccessKey: "test-secret",
  bucket: "polka-photos",
  endpoint: "https://storage.yandexcloud.net",
  region: "ru-central1",
  publicBaseUrl: "",
};

describe("createStorage", () => {
  it("returns local provider by default", () => {
    const storage = createStorage({
      provider: "local",
      uploadsDir: "/tmp/polka-uploads-test",
    });
    expect(storage.name).toBe("local");
  });

  it("throws when yandex is selected without credentials", () => {
    expect(() =>
      createStorage({
        provider: "yandex",
        uploadsDir: "/tmp/unused",
        yandex: {
          accessKeyId: "",
          secretAccessKey: "",
          bucket: "",
          endpoint: "https://storage.yandexcloud.net",
          region: "ru-central1",
          publicBaseUrl: "",
        },
      }),
    ).toThrow(/YANDEX_ACCESS_KEY_ID/);
  });

  it("throws when yandex config is omitted", () => {
    expect(() =>
      createStorage({
        provider: "yandex",
        uploadsDir: "/tmp/unused",
      }),
    ).toThrow(/требует конфигурацию/);
  });

  it("creates yandex provider when credentials are present", () => {
    const client: ObjectStorageClient = {
      putObject: vi.fn(),
      deleteObject: vi.fn(),
    };
    const storage = createStorage({
      provider: "yandex",
      uploadsDir: "/tmp/unused",
      yandex: baseYandexConfig,
      yandexClient: client,
    });
    expect(storage.name).toBe("yandex");
  });
});

describe("YandexObjectStorage", () => {
  it("uploads an object and returns a public HTTPS URL", async () => {
    const putObject = vi.fn(async () => undefined);
    const deleteObject = vi.fn(async () => undefined);
    const client: ObjectStorageClient = { putObject, deleteObject };

    const storage = new YandexObjectStorage({
      config: baseYandexConfig,
      client,
    });

    const pngPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    const stored = await storage.save({
      buffer: pngPixel,
      filename: "shoe.png",
      contentType: "image/png",
    });

    expect(putObject).toHaveBeenCalledTimes(1);
    const call = putObject.mock.calls[0]?.[0];
    expect(call?.bucket).toBe("polka-photos");
    expect(call?.key).toMatch(/^shoes\/.+\.png$/);
    expect(call?.contentType).toBe("image/png");
    expect(stored.key).toBe(call?.key);
    expect(stored.url).toBe(
      `https://storage.yandexcloud.net/polka-photos/${stored.key}`,
    );
  });

  it("uses YANDEX_PUBLIC_BASE_URL when provided", async () => {
    const putObject = vi.fn(async () => undefined);
    const storage = new YandexObjectStorage({
      config: {
        ...baseYandexConfig,
        publicBaseUrl: "https://cdn.example.com/polka",
      },
      client: { putObject, deleteObject: vi.fn() },
    });

    const stored = await storage.save({
      buffer: Buffer.from("x"),
      filename: "a.jpg",
      contentType: "image/jpeg",
    });

    expect(stored.url.startsWith("https://cdn.example.com/polka/")).toBe(true);
  });

  it("deletes an object by key", async () => {
    const deleteObject = vi.fn(async () => undefined);
    const storage = new YandexObjectStorage({
      config: baseYandexConfig,
      client: { putObject: vi.fn(), deleteObject },
    });

    await storage.remove("shoes/abc.png");
    expect(deleteObject).toHaveBeenCalledWith({
      bucket: "polka-photos",
      key: "shoes/abc.png",
    });
  });

  it("skips delete when key is empty", async () => {
    const deleteObject = vi.fn(async () => undefined);
    const storage = new YandexObjectStorage({
      config: baseYandexConfig,
      client: { putObject: vi.fn(), deleteObject },
    });

    await storage.remove("");
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe("HTTP API with yandex storage", () => {
  it("health reports yandex storage and create returns absolute photo URL", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { openDatabase } = await import("../src/db.js");
    const { createApp } = await import("../src/app.js");
    const { createStorage } = await import("../src/storage.js");

    const uploadsDir = mkdtempSync(join(tmpdir(), "polka-yandex-"));
    const putObject = vi.fn(async () => undefined);
    const deleteObject = vi.fn(async () => undefined);
    const storage = createStorage({
      provider: "yandex",
      uploadsDir,
      yandex: baseYandexConfig,
      yandexClient: { putObject, deleteObject },
    });
    const db = openDatabase(":memory:");
    const app = createApp({
      db,
      storage,
      publicDir: uploadsDir,
      uploadsDir,
      serveStatic: false,
    });

    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", () => resolve()));
    const server = app.server!;
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Не удалось запустить тестовый сервер.");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const health = await (await fetch(`${baseUrl}/api/health`)).json();
      expect(health.storage).toBe("yandex");

      const form = new FormData();
      form.set("name", "Ботинки");
      form.set("season", "winter");
      const pngPixel = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      form.set("photo", new Blob([pngPixel], { type: "image/png" }), "boot.png");

      const res = await fetch(`${baseUrl}/api/shoes`, { method: "POST", body: form });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.shoe.photoUrl).toMatch(
        /^https:\/\/storage\.yandexcloud\.net\/polka-photos\/shoes\/.+\.png$/,
      );
      expect(putObject).toHaveBeenCalledTimes(1);

      const del = await fetch(`${baseUrl}/api/shoes/${body.shoe.id}`, { method: "DELETE" });
      expect(del.status).toBe(200);
      expect(deleteObject).toHaveBeenCalledTimes(1);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
      rmSync(uploadsDir, { recursive: true, force: true });
    }
  });
});
