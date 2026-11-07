import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";

export type Db = Database.Database;

export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  const db = new Database(path.join(dataDir, "anything-to-arcade.db"));
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS generations (
      id TEXT PRIMARY KEY,
      image_path TEXT NOT NULL,
      image_hash TEXT NOT NULL,
      plan_json TEXT NOT NULL,
      genre TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY,
      generation_id TEXT NOT NULL,
      slot_id TEXT NOT NULL,
      status TEXT NOT NULL,
      tripo_task_id TEXT,
      glb_path TEXT,
      error TEXT,
      retries INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_assets_gen ON assets(generation_id);
    CREATE INDEX IF NOT EXISTS idx_gen_hash ON generations(image_hash);
  `);
  // Migrate databases created before the retry ladder existed.
  try {
    db.exec("ALTER TABLE assets ADD COLUMN retries INTEGER NOT NULL DEFAULT 0");
  } catch {
    // Column already present — nothing to do.
  }
  return db;
}
