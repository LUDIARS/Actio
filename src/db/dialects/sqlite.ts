/**
 * SQLite dialect: schema definitions + connection factory
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import { resolve } from "path";
import { mkdirSync } from "fs";
import * as schema from "../schema.js";
import * as curriculumSchema from "../curriculum-schema.js";
import { secretManager } from "../../config/secrets.js";

export { schema, curriculumSchema };

export type SqliteDatabase = InstanceType<typeof Database>;

export function createConnection(): { db: ReturnType<typeof drizzle>; sqlite: SqliteDatabase } {
  const dbPath = secretManager.getOrDefault("DATABASE_PATH", resolve("data", "schedula.db"));
  mkdirSync(resolve("data"), { recursive: true });

  const sqlite: SqliteDatabase = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  // 新規テーブルの自動作成 (migrate.ts を手動実行しなくても動くように)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS terms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL DEFAULT '',
      end_date TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE TABLE IF NOT EXISTS curriculum_placements (
      id TEXT PRIMARY KEY,
      term_id TEXT NOT NULL REFERENCES terms(id),
      curriculum_id TEXT NOT NULL REFERENCES curricula(id),
      day INTEGER NOT NULL,
      period INTEGER NOT NULL,
      room_id TEXT,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(term_id, day, period, room_id)
    );
    CREATE INDEX IF NOT EXISTS idx_placement_term ON curriculum_placements(term_id);
    CREATE INDEX IF NOT EXISTS idx_placement_curriculum ON curriculum_placements(curriculum_id);
  `);
  // 休日テーブル
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS holidays (
      id TEXT PRIMARY KEY,
      group_id TEXT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      end_date TEXT,
      holiday_type TEXT NOT NULL DEFAULT 'custom',
      recurrence TEXT NOT NULL DEFAULT 'none',
      source TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_holiday_group ON holidays(group_id);
    CREATE INDEX IF NOT EXISTS idx_holiday_date ON holidays(date);
    CREATE INDEX IF NOT EXISTS idx_holiday_type ON holidays(holiday_type);
  `);

  // グループ個別予定テーブル
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS group_events (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES groups(id),
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      end_date TEXT,
      all_day INTEGER NOT NULL DEFAULT 1,
      period INTEGER,
      duration INTEGER DEFAULT 1,
      event_type TEXT NOT NULL DEFAULT 'event',
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_group_event_group ON group_events(group_id);
    CREATE INDEX IF NOT EXISTS idx_group_event_date ON group_events(date);
  `);

  // カラム追加マイグレーション (既存DBとの互換)
  try { sqlite.exec(`ALTER TABLE group_schedules ADD COLUMN label TEXT`); } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE curricula ADD COLUMN term_id TEXT REFERENCES terms(id)`); } catch { /* already exists */ }

  const db = drizzle(sqlite, {
    schema: { ...schema, ...curriculumSchema },
  });

  return { db, sqlite };
}
