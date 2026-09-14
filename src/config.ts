import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(here, "..");

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
  projectRoot,
};

export type AppConfig = typeof config;
