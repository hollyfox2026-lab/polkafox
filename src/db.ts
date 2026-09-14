import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

export type DatabaseHandle = Database.Database;

/**
 * Открывает (или создаёт) базу данных SQLite и применяет схему.
 * Файл базы создаётся автоматически при первом запуске.
 */
export function openDatabase(dbPath: string): DatabaseHandle {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  migrate(db);
  return db;
}

function migrate(db: DatabaseHandle): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shoes (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      brand       TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      season      TEXT NOT NULL DEFAULT 'all',
      size        TEXT NOT NULL DEFAULT '',
      color       TEXT NOT NULL DEFAULT '',
      photo_url   TEXT NOT NULL DEFAULT '',
      photo_key   TEXT NOT NULL DEFAULT '',
      created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
}
