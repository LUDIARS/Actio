/**
 * SQLiteのテーブルを初期化するスクリプト
 * npm run db:init で実行
 */
import { createConnection } from "./dialects/sqlite.js";

const { sqlite } = createConnection();

// Core tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    role TEXT NOT NULL DEFAULT 'student',
    major TEXT,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    google_access_token TEXT,
    google_refresh_token TEXT,
    google_token_expires_at INTEGER,
    google_scopes TEXT,
    calendar_access_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
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
  CREATE INDEX IF NOT EXISTS idx_schedule_term ON schedule_entries(term_id);
  CREATE INDEX IF NOT EXISTS idx_schedule_instructor ON schedule_entries(instructor_id);

  CREATE TABLE IF NOT EXISTS unified_slots (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    day INTEGER NOT NULL,
    period INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'free',
    major_label TEXT,
    is_private INTEGER NOT NULL DEFAULT 0,
    source_module TEXT NOT NULL,
    cached_at INTEGER NOT NULL,
    UNIQUE(user_id, day, period, source_module)
  );
  CREATE INDEX IF NOT EXISTS idx_unified_user ON unified_slots(user_id);

  CREATE TABLE IF NOT EXISTS member_profiles (
    user_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    major TEXT NOT NULL,
    attendance_days TEXT NOT NULL DEFAULT '[]',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS "groups" (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    members TEXT NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'member',
    joined_at INTEGER NOT NULL,
    UNIQUE(group_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_group_member_user ON group_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_group_member_group ON group_members(group_id);

  CREATE TABLE IF NOT EXISTS group_schedules (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    title TEXT NOT NULL,
    description TEXT,
    day INTEGER NOT NULL,
    period INTEGER NOT NULL,
    duration INTEGER NOT NULL DEFAULT 1,
    date TEXT,
    schedule_type TEXT NOT NULL DEFAULT 'recurring',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_group_schedule_group ON group_schedules(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_schedule_date ON group_schedules(date);

  CREATE TABLE IF NOT EXISTS reservations (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    title TEXT NOT NULL,
    day INTEGER NOT NULL,
    period INTEGER NOT NULL,
    room_id TEXT NOT NULL REFERENCES rooms(id),
    created_by TEXT NOT NULL,
    participants TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    note TEXT NOT NULL DEFAULT '',
    version INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reservation_room_slot ON reservations(room_id, day, period);
  CREATE INDEX IF NOT EXISTS idx_reservation_group ON reservations(group_id);

  CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    events TEXT NOT NULL DEFAULT '[]',
    secret TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_by TEXT NOT NULL,
    fail_count INTEGER NOT NULL DEFAULT 0,
    last_delivered_at INTEGER,
    created_at INTEGER NOT NULL
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
  CREATE INDEX IF NOT EXISTS idx_delivery_webhook ON webhook_delivery_logs(webhook_id);

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
  CREATE INDEX IF NOT EXISTS idx_notification_user ON notifications(user_id);

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
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(user_id, day, period)
  );
  CREATE INDEX IF NOT EXISTS idx_personal_event_user ON personal_events(user_id);
  CREATE INDEX IF NOT EXISTS idx_personal_event_plan ON personal_events(plan_id);

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
  CREATE INDEX IF NOT EXISTS idx_plan_user ON plans(user_id);

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
  CREATE INDEX IF NOT EXISTS idx_myplan_user ON my_plans(user_id);
  CREATE INDEX IF NOT EXISTS idx_myplan_group ON my_plans(group_id);
`);

// Smart Scheduler tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS scheduling_tasks (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    title TEXT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 1,
    priority INTEGER NOT NULL DEFAULT 0,
    preferred_days TEXT NOT NULL DEFAULT '[]',
    preferred_periods TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'pending',
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_schtask_group ON scheduling_tasks(group_id);
  CREATE INDEX IF NOT EXISTS idx_schtask_status ON scheduling_tasks(status);

  CREATE TABLE IF NOT EXISTS scheduling_results (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    status TEXT NOT NULL DEFAULT 'draft',
    placements TEXT NOT NULL DEFAULT '[]',
    total_score INTEGER NOT NULL DEFAULT 0,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_schresult_group ON scheduling_results(group_id);
`);

// M1 Curriculum module tables (matches curriculum-schema.ts)
sqlite.exec(`
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
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_curricula_department ON curricula(department_id);
  CREATE INDEX IF NOT EXISTS idx_curricula_instructor ON curricula(instructor_id);

  CREATE TABLE IF NOT EXISTS instructor_available_slots (
    id TEXT PRIMARY KEY,
    instructor_id TEXT NOT NULL REFERENCES instructors(id),
    day INTEGER NOT NULL,
    periods TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_available_slots_instructor ON instructor_available_slots(instructor_id);
`);

// M1 schema additions: curriculum_departments junction table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS curriculum_departments (
    id TEXT PRIMARY KEY,
    curriculum_id TEXT NOT NULL REFERENCES curricula(id) ON DELETE CASCADE,
    department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_cd_curriculum ON curriculum_departments(curriculum_id);
  CREATE INDEX IF NOT EXISTS idx_cd_department ON curriculum_departments(department_id);
`);

console.log("Database tables initialized successfully.");
