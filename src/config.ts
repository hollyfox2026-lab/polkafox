import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

const defaultYandexEndpoint = "https://storage.yandexcloud.net";
const defaultYandexRegion = "ru-central1";

export const config = {
  port: Number(process.env.PORT ?? 3000),
  host: process.env.HOST ?? "0.0.0.0",
  /** Путь к файлу базы данных SQLite. По умолчанию — data/polka.db в корне проекта. */
  dbPath: process.env.DB_PATH ?? resolve(projectRoot, "data", "polka.db"),
  /** Каталог для локально сохранённых фотографий. */
  uploadsDir: process.env.UPLOADS_DIR ?? resolve(projectRoot, "uploads"),
  /** Каталог со статическим фронтендом. */
  publicDir: resolve(projectRoot, "public"),
  /** Выбор хранилища фотографий: local | yandex. */
  storageProvider: (process.env.STORAGE_PROVIDER ?? "local") as "local" | "yandex",
  /**
   * Параметры Yandex Object Storage (S3-совместимый API).
   * Используются при STORAGE_PROVIDER=yandex.
   */
  yandex: {
    accessKeyId: process.env.YANDEX_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.YANDEX_SECRET_ACCESS_KEY ?? "",
    bucket: process.env.YANDEX_BUCKET ?? "",
    endpoint: process.env.YANDEX_ENDPOINT ?? defaultYandexEndpoint,
    region: process.env.YANDEX_REGION ?? defaultYandexRegion,
    /**
     * Базовый публичный URL бакета без завершающего слэша.
     * По умолчанию: {endpoint}/{bucket}.
     */
    publicBaseUrl: process.env.YANDEX_PUBLIC_BASE_URL ?? "",
  },
  projectRoot,
};

export type AppConfig = typeof config;
export type YandexStorageConfig = AppConfig["yandex"];
