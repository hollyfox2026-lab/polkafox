import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { createApp } from "../src/app.js";
import { FoxStore } from "../src/foxes.js";

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp({ store: new FoxStore(), serveStatic: false });
  await new Promise<void>((resolve) => {
    app.listen(0, "127.0.0.1", () => resolve());
  });
  server = app.server as Server;
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Failed to bind test server.");
  }
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
});

describe("GET /api/health", () => {
  it("reports ok", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

describe("GET /api/foxes", () => {
  it("returns seeded sightings sorted newest first", async () => {
    const res = await fetch(`${baseUrl}/api/foxes`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.foxes)).toBe(true);
    expect(body.foxes.length).toBeGreaterThanOrEqual(2);
    const times = body.foxes.map((f: { seenAt: string }) => f.seenAt);
    const sorted = [...times].sort((a, b) => b.localeCompare(a));
    expect(times).toEqual(sorted);
  });
});

describe("POST /api/foxes", () => {
  it("creates a sighting and returns it", async () => {
    const res = await fetch(`${baseUrl}/api/foxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Ember", location: "Ridge Trail", note: "Sunbathing." }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.fox).toMatchObject({ name: "Ember", location: "Ridge Trail", note: "Sunbathing." });
    expect(typeof body.fox.id).toBe("number");
    expect(typeof body.fox.seenAt).toBe("string");

    const listRes = await fetch(`${baseUrl}/api/foxes`);
    const listBody = await listRes.json();
    const found = listBody.foxes.find((f: { id: number }) => f.id === body.fox.id);
    expect(found).toBeTruthy();
  });

  it("rejects invalid payloads with 422 and field errors", async () => {
    const res = await fetch(`${baseUrl}/api/foxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ note: "missing name and location" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    const fields = body.errors.map((e: { field: string }) => e.field);
    expect(fields).toContain("name");
    expect(fields).toContain("location");
  });

  it("rejects malformed JSON with 400", async () => {
    const res = await fetch(`${baseUrl}/api/foxes`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/foxes/:id", () => {
  it("returns 404 for unknown id", async () => {
    const res = await fetch(`${baseUrl}/api/foxes/99999`);
    expect(res.status).toBe(404);
  });
});
