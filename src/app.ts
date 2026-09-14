import type { IncomingMessage, ServerResponse } from "node:http";
import polka from "polka";
import sirv from "sirv";
import busboy from "busboy";
import type { DatabaseHandle } from "./db.js";
import { ShoeRepository, validateNewShoe, SEASONS, type Season } from "./shoes.js";
import type { StorageProvider } from "./storage.js";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_JSON_BYTES = 64 * 1024;

interface ParsedFile {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

function parseMultipart(
  req: IncomingMessage,
): Promise<{ fields: Record<string, string>; file?: ParsedFile }> {
  return new Promise((resolve, reject) => {
    const bb = busboy({
      headers: req.headers,
      limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 20 },
    });
    const fields: Record<string, string> = {};
    let file: ParsedFile | undefined;
    let tooLarge = false;

    bb.on("field", (name, value) => {
      fields[name] = value;
    });
    bb.on("file", (_name, stream, info) => {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("limit", () => {
        tooLarge = true;
        stream.resume();
      });
      stream.on("close", () => {
        if (!tooLarge && chunks.length > 0) {
          file = {
            buffer: Buffer.concat(chunks),
            filename: info.filename || "photo",
            mimeType: info.mimeType || "application/octet-stream",
          };
        }
      });
    });
    bb.on("error", reject);
    bb.on("close", () => {
      if (tooLarge) {
        reject(new Error("Файл превышает допустимый размер (8 МБ)."));
      } else {
        resolve({ fields, file });
      }
    });
    req.pipe(bb);
  });
}

async function readJson(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = chunk as Buffer;
    size += buf.length;
    if (size > MAX_JSON_BYTES) {
      throw new Error("Тело запроса слишком большое.");
    }
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf-8")) as Record<string, unknown>;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (value !== undefined && value !== null) {
      result[key] = String(value);
    }
  }
  return result;
}

export interface AppDeps {
  db: DatabaseHandle;
  storage: StorageProvider;
  publicDir: string;
  uploadsDir: string;
  serveStatic?: boolean;
}

export function createApp(deps: AppDeps) {
  const repo = new ShoeRepository(deps.db);
  const app = polka();

  app.get("/api/health", (_req, res) => {
    sendJson(res, 200, { status: "ok", storage: deps.storage.name });
  });

  app.get("/api/seasons", (_req, res) => {
    sendJson(res, 200, { seasons: SEASONS });
  });

  app.get("/api/shoes", (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    const seasonParam = url.searchParams.get("season") ?? undefined;
    const season =
      seasonParam && (SEASONS as readonly string[]).includes(seasonParam)
        ? (seasonParam as Season)
        : undefined;
    const query = url.searchParams.get("q") ?? undefined;
    sendJson(res, 200, { shoes: repo.list({ season, query }) });
  });

  app.get("/api/shoes/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      sendJson(res, 400, { error: "Идентификатор должен быть целым числом." });
      return;
    }
    const shoe = repo.get(id);
    if (!shoe) {
      sendJson(res, 404, { error: `Пара с id ${id} не найдена.` });
      return;
    }
    sendJson(res, 200, { shoe });
  });

  app.post("/api/shoes", async (req, res) => {
    let fields: Record<string, string> = {};
    let file: ParsedFile | undefined;

    const contentType = req.headers["content-type"] ?? "";
    try {
      if (contentType.includes("multipart/form-data")) {
        const parsed = await parseMultipart(req);
        fields = parsed.fields;
        file = parsed.file;
      } else {
        fields = await readJson(req);
      }
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
      return;
    }

    const errors = validateNewShoe(fields);
    if (errors.length > 0) {
      sendJson(res, 422, { errors });
      return;
    }

    let photoUrl = "";
    let photoKey = "";
    if (file) {
      if (!file.mimeType.startsWith("image/")) {
        sendJson(res, 422, {
          errors: [{ field: "photo", message: "Фотография должна быть изображением." }],
        });
        return;
      }
      try {
        const stored = await deps.storage.save({
          buffer: file.buffer,
          filename: file.filename,
          contentType: file.mimeType,
        });
        photoUrl = stored.url;
        photoKey = stored.key;
      } catch (err) {
        sendJson(res, 502, { error: `Не удалось сохранить фото: ${(err as Error).message}` });
        return;
      }
    }

    const shoe = repo.create({
      name: fields.name ?? "",
      brand: fields.brand,
      description: fields.description,
      season: (fields.season as Season) || "all",
      size: fields.size,
      color: fields.color,
      photoUrl,
      photoKey,
    });
    sendJson(res, 201, { shoe });
  });

  app.delete("/api/shoes/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      sendJson(res, 400, { error: "Идентификатор должен быть целым числом." });
      return;
    }
    const removed = repo.delete(id);
    if (!removed) {
      sendJson(res, 404, { error: `Пара с id ${id} не найдена.` });
      return;
    }
    if (removed.photoKey) {
      await deps.storage.remove(removed.photoKey).catch(() => undefined);
    }
    sendJson(res, 200, { shoe: removed });
  });

  if (deps.serveStatic ?? true) {
    app.use("/uploads", sirv(deps.uploadsDir, { dev: true }));
    app.use(sirv(deps.publicDir, { dev: true, single: true }));
  }

  return app;
}
