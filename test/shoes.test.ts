import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "node:http";
import { openDatabase, type DatabaseHandle } from "../src/db.js";
import { ShoeRepository } from "../src/shoes.js";
import { LocalDiskStorage } from "../src/storage.js";
import { createApp } from "../src/app.js";

describe("ShoeRepository", () => {
  let db: DatabaseHandle;

  beforeAll(() => {
    db = openDatabase(":memory:");
  });

  it("creates and lists shoes newest first", () => {
    const repo = new ShoeRepository(db);
    repo.create({ name: "Зимние сапоги", season: "winter", color: "чёрный" });
    repo.create({ name: "Летние кеды", season: "summer", color: "белый" });
    const all = repo.list();
    expect(all.length).toBe(2);
    expect(all[0]?.name).toBe("Летние кеды");
  });

  it("filters by season and query", () => {
    const repo = new ShoeRepository(db);
    expect(repo.list({ season: "winter" }).every((s) => s.season === "winter")).toBe(true);
    expect(repo.list({ query: "кеды" }).length).toBeGreaterThanOrEqual(1);
    expect(repo.list({ query: "белый" }).length).toBeGreaterThanOrEqual(1);
  });
});

describe("HTTP API", () => {
  let server: Server;
  let baseUrl: string;
  let uploadsDir: string;

  beforeAll(async () => {
    uploadsDir = mkdtempSync(join(tmpdir(), "polka-uploads-"));
    const db = openDatabase(":memory:");
    const storage = new LocalDiskStorage(uploadsDir);
    const app = createApp({
      db,
      storage,
      publicDir: uploadsDir,
      uploadsDir,
      serveStatic: false,
    });
    await new Promise<void>((resolve) => app.listen(0, "127.0.0.1", () => resolve()));
    server = app.server as Server;
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Не удалось запустить тестовый сервер.");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    );
    rmSync(uploadsDir, { recursive: true, force: true });
  });

  it("health reports storage provider", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.storage).toBe("local");
  });

  it("creates a shoe with a photo via multipart and stores the file", async () => {
    const form = new FormData();
    form.set("name", "Кроссовки");
    form.set("brand", "Nike");
    form.set("season", "summer");
    form.set("size", "42");
    form.set("color", "синий");
    const pngPixel = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    );
    form.set("photo", new Blob([pngPixel], { type: "image/png" }), "shoe.png");

    const res = await fetch(`${baseUrl}/api/shoes`, { method: "POST", body: form });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.shoe).toMatchObject({ name: "Кроссовки", brand: "Nike", season: "summer" });
    expect(body.shoe.photoUrl).toMatch(/^\/uploads\//);
    expect(readdirSync(uploadsDir).length).toBe(1);
  });

  it("lists shoes and filters by season", async () => {
    const res = await fetch(`${baseUrl}/api/shoes?season=summer`);
    const body = await res.json();
    expect(body.shoes.length).toBeGreaterThanOrEqual(1);
    expect(body.shoes.every((s: { season: string }) => s.season === "summer")).toBe(true);
  });

  it("rejects a shoe without a name (422)", async () => {
    const res = await fetch(`${baseUrl}/api/shoes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ brand: "без имени" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.errors.map((e: { field: string }) => e.field)).toContain("name");
  });

  it("deletes a shoe and removes its photo file", async () => {
    const listBefore = await (await fetch(`${baseUrl}/api/shoes`)).json();
    const target = listBefore.shoes[0];
    expect(target).toBeTruthy();

    const res = await fetch(`${baseUrl}/api/shoes/${target.id}`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(readdirSync(uploadsDir).length).toBe(0);

    const check = await fetch(`${baseUrl}/api/shoes/${target.id}`);
    expect(check.status).toBe(404);
  });
});
