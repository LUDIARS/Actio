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

  // PM モジュールテーブル
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS pm_projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source TEXT NOT NULL,
      source_config TEXT NOT NULL DEFAULT '{}',
      sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
      last_synced_at TEXT,
      owner_id TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_pm_projects_owner ON pm_projects(owner_id);

    CREATE TABLE IF NOT EXISTS pm_tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      external_url TEXT,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      assignees TEXT NOT NULL DEFAULT '[]',
      labels TEXT NOT NULL DEFAULT '[]',
      due_date TEXT,
      milestone_external_id TEXT,
      milestone_name TEXT,
      estimated_hours REAL,
      blocked_by TEXT NOT NULL DEFAULT '[]',
      description_hash TEXT,
      dirty_flag INTEGER NOT NULL DEFAULT 0,
      local_updated_at TEXT,
      external_updated_at TEXT,
      last_synced_at TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_pm_tasks_project ON pm_tasks(project_id);
    CREATE INDEX IF NOT EXISTS idx_pm_tasks_status ON pm_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_pm_tasks_due_date ON pm_tasks(due_date);
    CREATE INDEX IF NOT EXISTS idx_pm_tasks_dirty ON pm_tasks(dirty_flag);

    CREATE TABLE IF NOT EXISTS pm_task_snapshots (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      change_type TEXT NOT NULL,
      changed_fields TEXT NOT NULL DEFAULT '{}',
      snapshot_data TEXT NOT NULL DEFAULT '{}',
      detected_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pm_snapshots_task ON pm_task_snapshots(task_id);

    CREATE TABLE IF NOT EXISTS pm_milestones (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      external_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      state TEXT NOT NULL DEFAULT 'open',
      external_updated_at TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
    CREATE INDEX IF NOT EXISTS idx_pm_milestones_project ON pm_milestones(project_id);

    CREATE TABLE IF NOT EXISTS pm_task_validations (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      issues TEXT NOT NULL DEFAULT '[]',
      suggestions TEXT NOT NULL DEFAULT '[]',
      related_commits TEXT NOT NULL DEFAULT '[]',
      test_files TEXT NOT NULL DEFAULT '[]',
      validated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pm_validations_task ON pm_task_validations(task_id);

    CREATE TABLE IF NOT EXISTS pm_conflicts (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL,
      project_id TEXT NOT NULL,
      local_version TEXT NOT NULL DEFAULT '{}',
      external_version TEXT NOT NULL DEFAULT '{}',
      base_version TEXT NOT NULL DEFAULT '{}',
      resolution TEXT NOT NULL DEFAULT 'manual',
      resolved_data TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at_text TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_pm_conflicts_project ON pm_conflicts(project_id);
    CREATE INDEX IF NOT EXISTS idx_pm_conflicts_status ON pm_conflicts(status);

    CREATE TABLE IF NOT EXISTS pm_analytics_cache (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      report_type TEXT NOT NULL,
      data TEXT NOT NULL DEFAULT '{}',
      generated_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pm_cache_project_type ON pm_analytics_cache(project_id, report_type);
  `);

  // カラム追加マイグレーション (既存DBとの互換)
  try { sqlite.exec(`ALTER TABLE group_schedules ADD COLUMN label TEXT`); } catch { /* already exists */ }
  try { sqlite.exec(`ALTER TABLE curricula ADD COLUMN term_id TEXT REFERENCES terms(id)`); } catch { /* already exists */ }

  const db = drizzle(sqlite, {
    schema: { ...schema, ...curriculumSchema },
  });

  return { db, sqlite };
}
