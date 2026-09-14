import { mkdirSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";

export interface UploadInput {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface StoredPhoto {
  /** Публичный URL для отображения фотографии в интерфейсе. */
  url: string;
  /** Ключ (идентификатор объекта) для последующего удаления. */
  key: string;
}

export interface StorageProvider {
  readonly name: string;
  save(input: UploadInput): Promise<StoredPhoto>;
  remove(key: string): Promise<void>;
}

const SAFE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"]);

function safeExtension(filename: string, contentType: string): string {
  const ext = extname(filename).toLowerCase();
  if (SAFE_EXT.has(ext)) {
    return ext;
  }
  if (contentType.includes("png")) return ".png";
  if (contentType.includes("webp")) return ".webp";
  if (contentType.includes("gif")) return ".gif";
  if (contentType.includes("avif")) return ".avif";
  return ".jpg";
}

/**
 * Хранит фотографии в локальном каталоге на диске сервера и раздаёт их по
 * относительному URL `/uploads/<key>`. Это провайдер по умолчанию: работает без
 * внешних учётных записей и ключей.
 */
export class LocalDiskStorage implements StorageProvider {
  readonly name = "local";

  constructor(private readonly uploadsDir: string) {
    mkdirSync(this.uploadsDir, { recursive: true });
  }

  async save(input: UploadInput): Promise<StoredPhoto> {
    const key = `${randomUUID()}${safeExtension(input.filename, input.contentType)}`;
    await writeFile(join(this.uploadsDir, key), input.buffer);
    return { url: `/uploads/${key}`, key };
  }

  async remove(key: string): Promise<void> {
    if (!key) return;
    try {
      await unlink(join(this.uploadsDir, key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
    }
  }
}

export interface StorageOptions {
  provider: "local" | "yandex";
  uploadsDir: string;
}

/**
 * Выбирает провайдера хранилища.
 *
 * Сейчас реализован локальный провайдер. Облачный провайдер Yandex
 * (Object Storage для стабильных публичных ссылок или Yandex Диск)
 * подключается на следующем шаге — после выбора варианта и добавления ключей
 * доступа в секреты. Интерфейс StorageProvider не меняется, поэтому переход
 * не затронет остальной код.
 */
export function createStorage(options: StorageOptions): StorageProvider {
  if (options.provider === "yandex") {
    throw new Error(
      "Провайдер 'yandex' ещё не подключён. Выберите Object Storage или Диск и добавьте ключи доступа; " +
        "до этого используйте STORAGE_PROVIDER=local.",
    );
  }
  return new LocalDiskStorage(options.uploadsDir);
}
