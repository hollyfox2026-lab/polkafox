import type { IncomingMessage, ServerResponse } from "node:http";
import polka from "polka";
import sirv from "sirv";
import busboy from "busboy";
import type { DatabaseHandle } from "./db.js";
import {
  ShoeRepository,
  validateNewShoe,
  validateShoePatch,
  SEASONS,
  type Season,
  type UpdateShoe,
} from "./shoes.js";
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

async function parseBody(
  req: IncomingMessage,
): Promise<{ fields: Record<string, string>; file?: ParsedFile }> {
  const contentType = req.headers["content-type"] ?? "";
  if (contentType.includes("multipart/form-data")) {
    return parseMultipart(req);
  }
  return { fields: await readJson(req) };
}

type SavePhotoResult =
  | { ok: true; url: string; key: string }
  | { ok: false; status: number; payload: unknown };

async function savePhoto(storage: StorageProvider, file: ParsedFile): Promise<SavePhotoResult> {
  if (!file.mimeType.startsWith("image/")) {
    return {
      ok: false,
      status: 422,
      payload: {
        errors: [{ field: "photo", message: "Фотография должна быть изображением." }],
      },
    };
  }
  try {
    const stored = await storage.save({
      buffer: file.buffer,
      filename: file.filename,
      contentType: file.mimeType,
    });
    return { ok: true, url: stored.url, key: stored.key };
  } catch (err) {
    return {
      ok: false,
      status: 502,
      payload: { error: `Не удалось сохранить фото: ${(err as Error).message}` },
    };
  }
}

function patchFromFields(fields: Record<string, string>): UpdateShoe {
  const patch: UpdateShoe = {};
  if ("name" in fields) patch.name = fields.name;
  if ("brand" in fields) patch.brand = fields.brand;
  if ("description" in fields) patch.description = fields.description;
  if ("season" in fields) patch.season = (fields.season as Season) || "all";
  if ("size" in fields) patch.size = fields.size;
  if ("color" in fields) patch.color = fields.color;
  return patch;
}

export interface AppDeps {
  db: DatabaseHandle;
  storage: StorageProvider;
  publicDir: string;
  uploadsDir: string;
  serveStatic?: boolean;
  /** Подмена репозитория для тестов (симуляция ошибок БД). */
  repository?: ShoeRepository;
}

export function createApp(deps: AppDeps) {
  const repo = deps.repository ?? new ShoeRepository(deps.db);
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

    try {
      const parsed = await parseBody(req);
      fields = parsed.fields;
      file = parsed.file;
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
      const saved = await savePhoto(deps.storage, file);
      if (!saved.ok) {
        sendJson(res, saved.status, saved.payload);
        return;
      }
      photoUrl = saved.url;
      photoKey = saved.key;
    }

    try {
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
    } catch (err) {
      if (photoKey) {
        await deps.storage.remove(photoKey).catch(() => undefined);
      }
      sendJson(res, 500, { error: `Не удалось сохранить запись: ${(err as Error).message}` });
    }
  });

  app.patch("/api/shoes/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      sendJson(res, 400, { error: "Идентификатор должен быть целым числом." });
      return;
    }

    const existing = repo.get(id);
    if (!existing) {
      sendJson(res, 404, { error: `Пара с id ${id} не найдена.` });
      return;
    }

    let fields: Record<string, string> = {};
    let file: ParsedFile | undefined;
    try {
      const parsed = await parseBody(req);
      fields = parsed.fields;
      file = parsed.file;
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message });
      return;
    }

    const errors = validateShoePatch(fields);
    if (errors.length > 0) {
      sendJson(res, 422, { errors });
      return;
    }

    const patch = patchFromFields(fields);
    let newPhotoKey: string | undefined;
    const previousPhotoKey = existing.photoKey;

    if (file) {
      const saved = await savePhoto(deps.storage, file);
      if (!saved.ok) {
        sendJson(res, saved.status, saved.payload);
        return;
      }
      patch.photoUrl = saved.url;
      patch.photoKey = saved.key;
      newPhotoKey = saved.key;
    }

    try {
      const shoe = repo.update(id, patch);
      if (!shoe) {
        if (newPhotoKey) {
          await deps.storage.remove(newPhotoKey).catch(() => undefined);
        }
        sendJson(res, 404, { error: `Пара с id ${id} не найдена.` });
        return;
      }
      if (newPhotoKey && previousPhotoKey && previousPhotoKey !== newPhotoKey) {
        await deps.storage.remove(previousPhotoKey).catch(() => undefined);
      }
      sendJson(res, 200, { shoe });
    } catch (err) {
      if (newPhotoKey) {
        await deps.storage.remove(newPhotoKey).catch(() => undefined);
      }
      sendJson(res, 500, { error: `Не удалось обновить запись: ${(err as Error).message}` });
    }
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
