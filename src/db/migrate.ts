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

// Curriculum module tables (enterprise patch)
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS instructors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    major TEXT NOT NULL,
    courses TEXT NOT NULL DEFAULT '[]',
    availability TEXT NOT NULL,
    availability_condition_type TEXT NOT NULL DEFAULT 'any',
    availability_condition TEXT NOT NULL DEFAULT '{}',
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS curricula (
    id TEXT PRIMARY KEY,
    department_name TEXT NOT NULL,
    name TEXT NOT NULL,
    instructor_id TEXT NOT NULL REFERENCES instructors(id),
    slots_per_session INTEGER NOT NULL DEFAULT 1,
    total_sessions INTEGER NOT NULL,
    room_type TEXT NOT NULL,
    room_id TEXT,
    editable_until INTEGER NOT NULL,
    term_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS curriculum_plans (
    id TEXT PRIMARY KEY,
    curriculum_id TEXT NOT NULL REFERENCES curricula(id),
    name TEXT NOT NULL,
    term_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft',
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS plan_blocks (
    id TEXT PRIMARY KEY,
    plan_id TEXT NOT NULL REFERENCES curriculum_plans(id),
    curriculum_id TEXT NOT NULL REFERENCES curricula(id),
    session_number INTEGER NOT NULL,
    placement_status TEXT NOT NULL DEFAULT 'unplaced',
    day INTEGER,
    period INTEGER,
    block_size INTEGER NOT NULL DEFAULT 1,
    error_message TEXT,
    color TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE(plan_id, curriculum_id, session_number)
  );
  CREATE INDEX IF NOT EXISTS idx_plan_blocks_plan ON plan_blocks(plan_id);
  CREATE INDEX IF NOT EXISTS idx_plan_blocks_curriculum ON plan_blocks(curriculum_id);
`);

console.log("Database tables initialized successfully.");
