/**
 * Test helpers: アプリ初期化、認証ヘルパー、DBセットアップ
 */
import Database from "better-sqlite3";
import { resolve } from "path";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-key-for-testing";

/** テスト用DBのテーブルを作成（migrate.tsと同じSQL） */
export function initTestDatabase() {
  const dbPath = process.env.DATABASE_PATH || resolve("data", "test.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      major TEXT,
      calendar_access_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      -- legacy (Cernere 移管済み): 新規コードから読み書きしない
      name TEXT,
      email TEXT UNIQUE,
      role TEXT DEFAULT 'general',
      password_hash TEXT,
      google_id TEXT UNIQUE,
      google_access_token TEXT,
      google_refresh_token TEXT,
      google_token_expires_at INTEGER,
      google_scopes TEXT,
      last_login_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS module_installations (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL UNIQUE,
      package_name TEXT NOT NULL,
      package_version TEXT NOT NULL,
      manifest TEXT NOT NULL,
      installed_at INTEGER NOT NULL,
      installed_by TEXT
    );

    CREATE TABLE IF NOT EXISTS module_states (
      id TEXT PRIMARY KEY,
      module_id TEXT NOT NULL,
      scope_type TEXT NOT NULL,
      scope_id TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      changed_at INTEGER NOT NULL,
      changed_by TEXT,
      UNIQUE(module_id, scope_type, scope_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      refresh_token TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL,
      type TEXT NOT NULL,
      equipment TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS schedule_entries (
      id TEXT PRIMARY KEY,
      day INTEGER NOT NULL,
      period INTEGER NOT NULL,
      curriculum_id TEXT NOT NULL,
      room_id TEXT REFERENCES rooms(id),
      instructor_id TEXT NOT NULL,
      candidate_count INTEGER NOT NULL DEFAULT 0,
      is_confirmed INTEGER NOT NULL DEFAULT 0,
      term_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(day, period, room_id, term_id)
    );

    CREATE TABLE IF NOT EXISTS "groups" (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      enabled_modules TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_members (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES "groups"(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      role TEXT NOT NULL DEFAULT 'member',
      joined_at INTEGER NOT NULL,
      UNIQUE(group_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS group_schedules (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES "groups"(id),
      title TEXT NOT NULL,
      description TEXT,
      day INTEGER NOT NULL,
      period INTEGER NOT NULL,
      duration INTEGER NOT NULL DEFAULT 1,
      date TEXT,
      schedule_type TEXT NOT NULL DEFAULT 'recurring',
      label TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reservations (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES "groups"(id),
      title TEXT NOT NULL,
      day INTEGER NOT NULL,
      period INTEGER NOT NULL,
      room_id TEXT NOT NULL REFERENCES rooms(id),
      created_by TEXT NOT NULL,
      participants TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'pending',
      note TEXT NOT NULL DEFAULT '',
      version INTEGER NOT NULL DEFAULT 1,
      calendar_event_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS personal_events (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      description TEXT,
      day INTEGER NOT NULL,
      period INTEGER NOT NULL,
      duration INTEGER NOT NULL DEFAULT 1,
      start_time TEXT,
      end_time TEXT,
      event_type TEXT NOT NULL DEFAULT 'personal',
      plan_id TEXT,
      is_private INTEGER NOT NULL DEFAULT 1,
      google_calendar_event_id TEXT,
      notion_page_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, day, period)
    );

    CREATE TABLE IF NOT EXISTS plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      name TEXT NOT NULL,
      description TEXT,
      days TEXT NOT NULL DEFAULT '[]',
      start_period INTEGER NOT NULL,
      duration INTEGER NOT NULL DEFAULT 1,
      event_type TEXT NOT NULL DEFAULT 'personal',
      is_private INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS my_plans (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      group_id TEXT,
      name TEXT NOT NULL,
      pattern_type TEXT NOT NULL DEFAULT 'basic',
      valid_from TEXT,
      valid_until TEXT,
      weekly_schedule TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduling_tasks (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES "groups"(id),
      title TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 1,
      priority INTEGER NOT NULL DEFAULT 0,
      preferred_days TEXT NOT NULL DEFAULT '[]',
      preferred_periods TEXT NOT NULL DEFAULT '[]',
      instructor_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS scheduling_results (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES "groups"(id),
      status TEXT NOT NULL DEFAULT 'draft',
      placements TEXT NOT NULL DEFAULT '[]',
      total_score INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_endpoints (
      id TEXT PRIMARY KEY,
      url TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      secret TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'generic',
      send_method TEXT NOT NULL DEFAULT 'webhook',
      bot_token TEXT,
      channel_id TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_by TEXT NOT NULL,
      fail_count INTEGER NOT NULL DEFAULT 0,
      last_delivered_at INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_templates (
      id TEXT PRIMARY KEY,
      event TEXT NOT NULL,
      platform TEXT NOT NULL DEFAULT 'all',
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      use_code_block INTEGER NOT NULL DEFAULT 0,
      code_block_lang TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS webhook_delivery_logs (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL REFERENCES webhook_endpoints(id),
      delivery_id TEXT NOT NULL,
      event TEXT NOT NULL,
      status_code INTEGER,
      success INTEGER NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      latency_ms INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification_preferences (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      channel TEXT NOT NULL,
      enabled_events TEXT NOT NULL DEFAULT '[]',
      reminder_day_before INTEGER NOT NULL DEFAULT 1,
      reminder_day_before_time TEXT NOT NULL DEFAULT '18:00',
      reminder_morning_of INTEGER NOT NULL DEFAULT 1,
      reminder_morning_of_time TEXT NOT NULL DEFAULT '08:00',
      reminder_before INTEGER NOT NULL DEFAULT 1,
      reminder_before_minutes INTEGER NOT NULL DEFAULT 15,
      quiet_hours_start TEXT NOT NULL DEFAULT '22:00',
      quiet_hours_end TEXT NOT NULL DEFAULT '07:00',
      UNIQUE(user_id, channel)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      event TEXT NOT NULL,
      channel TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voting_events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_by TEXT NOT NULL REFERENCES users(id),
      deadline TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS voting_candidates (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES voting_events(id),
      label TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS votes (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES voting_events(id),
      candidate_id TEXT NOT NULL REFERENCES voting_candidates(id),
      user_id TEXT NOT NULL REFERENCES users(id),
      answer TEXT NOT NULL,
      is_auto_reply INTEGER NOT NULL DEFAULT 0,
      comment TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(event_id, candidate_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instructors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS curricula (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      department_id TEXT NOT NULL REFERENCES departments(id),
      periods INTEGER NOT NULL DEFAULT 1,
      instructor_id TEXT REFERENCES instructors(id),
      valid_from TEXT,
      valid_until TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS instructor_available_slots (
      id TEXT PRIMARY KEY,
      instructor_id TEXT NOT NULL REFERENCES instructors(id),
      day INTEGER NOT NULL,
      periods TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS curriculum_departments (
      id TEXT PRIMARY KEY,
      curriculum_id TEXT NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

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
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS group_events (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL REFERENCES "groups"(id),
      title TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      end_date TEXT,
      all_day INTEGER NOT NULL DEFAULT 1,
      period INTEGER,
      duration INTEGER DEFAULT 1,
      event_type TEXT NOT NULL DEFAULT 'event',
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS integration_settings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      service TEXT NOT NULL,
      access_token TEXT,
      refresh_token TEXT,
      token_expires_at INTEGER,
      config TEXT NOT NULL DEFAULT '{}',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, service)
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      assignee_id TEXT,
      group_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      requirements TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium',
      deadline INTEGER,
      estimated_minutes INTEGER,
      plugin_id TEXT,
      plugin_ref TEXT,
      plugin_payload TEXT,
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id),
      service TEXT NOT NULL,
      action TEXT NOT NULL,
      local_event_id TEXT,
      external_id TEXT,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at INTEGER NOT NULL
    );
  `);

  sqlite.close();
}

/** テスト用DBの全テーブルをクリアする */
export function clearTestDatabase() {
  const dbPath = process.env.DATABASE_PATH || resolve("data", "test.db");
  const sqlite = new Database(dbPath);
  sqlite.pragma("foreign_keys = OFF");

  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
    .all() as { name: string }[];

  // module_installations はアプリ起動時に一度だけ登録されるので保持する
  // (各テスト beforeEach で再登録は非現実的)
  const PRESERVED = new Set(["module_installations", "module_states"]);

  for (const { name } of tables) {
    if (PRESERVED.has(name)) continue;
    sqlite.exec(`DELETE FROM "${name}"`);
  }

  sqlite.pragma("foreign_keys = ON");
  sqlite.close();
}

/** テスト用JWTトークンを生成 */
export function generateTestToken(userId: string, role: string = "general"): string {
  return jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "1h" });
}

/** テスト用ユーザーをDBに直接挿入 */
export function insertTestUser(data: {
  id: string;
  name: string;
  email: string;
  role?: string;
  passwordHash?: string;
}) {
  const dbPath = process.env.DATABASE_PATH || resolve("data", "test.db");
  const sqlite = new Database(dbPath);
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO users (id, name, email, role, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(data.id, data.name, data.email, data.role || "general", data.passwordHash || null, now, now);
  sqlite.close();
}

/** テスト用グループをDBに直接挿入 */
export function insertTestGroup(data: { id: string; name: string; createdBy: string }) {
  const dbPath = process.env.DATABASE_PATH || resolve("data", "test.db");
  const sqlite = new Database(dbPath);
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO "groups" (id, name, created_by, created_at) VALUES (?, ?, ?, ?)`
    )
    .run(data.id, data.name, data.createdBy, now);
  sqlite.close();
}

/** テスト用ルームをDBに直接挿入 */
export function insertTestRoom(data: { id: string; name: string; capacity: number; type: string }) {
  const dbPath = process.env.DATABASE_PATH || resolve("data", "test.db");
  const sqlite = new Database(dbPath);
  const now = Date.now();
  sqlite
    .prepare(
      `INSERT INTO rooms (id, name, capacity, type, equipment, created_at) VALUES (?, ?, ?, ?, '[]', ?)`
    )
    .run(data.id, data.name, data.capacity, data.type, now);
  sqlite.close();
}

/** Hono アプリにリクエストを送るヘルパー */
export async function request(
  app: any,
  method: string,
  path: string,
  options?: {
    body?: any;
    token?: string;
    headers?: Record<string, string>;
  }
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...options?.headers,
  };

  if (options?.token) {
    headers["Authorization"] = `Bearer ${options.token}`;
  }

  const init: RequestInit = {
    method,
    headers,
  };

  if (options?.body) {
    init.body = JSON.stringify(options.body);
  }

  const url = `http://localhost${path}`;
  const res = await app.request(url, init);
  const json = await res.json().catch(() => ({}));

  return { status: res.status, json };
}
