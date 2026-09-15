import { mkdirSync } from "node:fs";
import { writeFile, unlink } from "node:fs/promises";
import { extname, join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import type { YandexStorageConfig } from "./config.js";

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

/**
 * Минимальный клиент Object Storage для подмены в тестах.
 */
export interface ObjectStorageClient {
  putObject(input: {
    bucket: string;
    key: string;
    body: Buffer;
    contentType: string;
  }): Promise<void>;
  deleteObject(input: { bucket: string; key: string }): Promise<void>;
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

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
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

export interface YandexObjectStorageOptions {
  config: YandexStorageConfig;
  /** Подмена S3-клиента (для unit-тестов). */
  client?: ObjectStorageClient;
}

/**
 * Хранит фотографии в Yandex Object Storage через S3-совместимый API.
 * В БД сохраняется абсолютный HTTPS URL объекта; фронтенд использует его как src.
 */
export class YandexObjectStorage implements StorageProvider {
  readonly name = "yandex";
  private readonly client: ObjectStorageClient;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(options: YandexObjectStorageOptions) {
    const { config } = options;
    this.bucket = config.bucket;
    this.publicBaseUrl = trimTrailingSlash(
      config.publicBaseUrl || `${trimTrailingSlash(config.endpoint)}/${config.bucket}`,
    );
    this.client = options.client ?? createAwsS3Client(config);
  }

  async save(input: UploadInput): Promise<StoredPhoto> {
    const key = `shoes/${randomUUID()}${safeExtension(input.filename, input.contentType)}`;
    await this.client.putObject({
      bucket: this.bucket,
      key,
      body: input.buffer,
      contentType: input.contentType,
    });
    return { url: `${this.publicBaseUrl}/${key}`, key };
  }

  async remove(key: string): Promise<void> {
    if (!key) return;
    await this.client.deleteObject({ bucket: this.bucket, key });
  }
}

function createAwsS3Client(config: YandexStorageConfig): ObjectStorageClient {
  const s3Config: S3ClientConfig = {
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: true,
  };
  const s3 = new S3Client(s3Config);

  return {
    async putObject({ bucket, key, body, contentType }) {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          // Публичность задаётся настройкой бакета «чтение объектов для всех»,
          // без ACL на объект (иначе Yandex часто отвечает AccessDenied).
        }),
      );
    },
    async deleteObject({ bucket, key }) {
      await s3.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        }),
      );
    },
  };
}

export interface StorageOptions {
  provider: "local" | "yandex";
  uploadsDir: string;
  yandex?: YandexStorageConfig;
  /** Подмена S3-клиента при provider=yandex (для тестов). */
  yandexClient?: ObjectStorageClient;
}

function assertYandexConfig(config: YandexStorageConfig | undefined): YandexStorageConfig {
  if (!config) {
    throw new Error(
      "Провайдер 'yandex' требует конфигурацию Object Storage (accessKeyId, secretAccessKey, bucket).",
    );
  }
  const missing: string[] = [];
  if (!config.accessKeyId) missing.push("YANDEX_ACCESS_KEY_ID");
  if (!config.secretAccessKey) missing.push("YANDEX_SECRET_ACCESS_KEY");
  if (!config.bucket) missing.push("YANDEX_BUCKET");
  if (missing.length > 0) {
    throw new Error(
      `Провайдер 'yandex' не настроен. Задайте переменные окружения: ${missing.join(", ")}.`,
    );
  }
  return config;
}

/**
 * Выбирает провайдера хранилища: локальный диск или Yandex Object Storage.
 */
export function createStorage(options: StorageOptions): StorageProvider {
  if (options.provider === "yandex") {
    const yandex = assertYandexConfig(options.yandex);
    return new YandexObjectStorage({
      config: yandex,
      client: options.yandexClient,
    });
  }
  return new LocalDiskStorage(options.uploadsDir);
}
