import { fileURLToPath } from "node:url";
import type { IncomingMessage, ServerResponse } from "node:http";
import polka from "polka";
import sirv from "sirv";
import { FoxStore, validateNewSighting, type NewFoxSighting } from "./foxes.js";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));
const MAX_BODY_BYTES = 64 * 1024;

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_BODY_BYTES) {
      throw new Error("Request body too large.");
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) {
    return undefined;
  }
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (raw.length === 0) {
    return undefined;
  }
  return JSON.parse(raw) as unknown;
}

export interface AppOptions {
  store?: FoxStore;
  serveStatic?: boolean;
}

export function createApp(options: AppOptions = {}) {
  const store = options.store ?? new FoxStore();
  const serveStatic = options.serveStatic ?? true;
  const app = polka();

  app.get("/api/health", (_req, res) => {
    sendJson(res, 200, { status: "ok", uptime: process.uptime() });
  });

  app.get("/api/foxes", (_req, res) => {
    sendJson(res, 200, { foxes: store.list() });
  });

  app.get("/api/foxes/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      sendJson(res, 400, { error: "Id must be an integer." });
      return;
    }
    const fox = store.get(id);
    if (!fox) {
      sendJson(res, 404, { error: `No sighting with id ${id}.` });
      return;
    }
    sendJson(res, 200, { fox });
  });

  app.post("/api/foxes", async (req, res) => {
    let body: unknown;
    try {
      body = await readJsonBody(req);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body." });
      return;
    }

    const errors = validateNewSighting(body);
    if (errors.length > 0) {
      sendJson(res, 422, { errors });
      return;
    }

    const fox = store.add(body as NewFoxSighting);
    sendJson(res, 201, { fox });
  });

  if (serveStatic) {
    app.use(sirv(PUBLIC_DIR, { dev: true, single: true }));
  }

  return app;
}
