/**
 * SQLiteのテーブルを初期化するスクリプト
 * npm run db:init で実行
 */
import { createConnection } from "./dialects/sqlite.js";

const { sqlite } = createConnection();

// Core tables
// users: 個人データは Cernere で管理 (AIFormat 個人データ保管禁止ルール)。
// name/email/role/auth 系カラムは legacy として残置するが NOT NULL は付けない。
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
    google_scopes TEXT
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
  CREATE INDEX IF NOT EXISTS idx_module_states_lookup ON module_states(module_id, scope_type, scope_id);

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
    label TEXT,
    created_by TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_group_schedule_group ON group_schedules(group_id);
  CREATE INDEX IF NOT EXISTS idx_group_schedule_date ON group_schedules(date);
  CREATE INDEX IF NOT EXISTS idx_group_schedule_label ON group_schedules(label);

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
    instructor_id TEXT,
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
    valid_from TEXT,
    valid_until TEXT,
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

// App Settings table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`);

// ─── Schema migrations (add columns to existing tables) ─────
// These are safe to run multiple times due to SQLite's ALTER TABLE IF NOT EXISTS behavior
try { sqlite.exec(`ALTER TABLE group_schedules ADD COLUMN label TEXT`); } catch { /* column already exists */ }
try { sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_group_schedule_label ON group_schedules(label)`); } catch { /* index already exists */ }
try { sqlite.exec(`ALTER TABLE curricula ADD COLUMN valid_from TEXT`); } catch { /* column already exists */ }
try { sqlite.exec(`ALTER TABLE curricula ADD COLUMN valid_until TEXT`); } catch { /* column already exists */ }
try { sqlite.exec(`ALTER TABLE users ADD COLUMN last_login_at INTEGER`); } catch { /* column already exists */ }
try { sqlite.exec(`ALTER TABLE "groups" ADD COLUMN enabled_modules TEXT`); } catch { /* column already exists */ }

// M1: Terms table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS terms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    start_date TEXT,
    end_date TEXT,
    created_at INTEGER NOT NULL
  );
`);

// M1: Curriculum Placements table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS curriculum_placements (
    id TEXT PRIMARY KEY,
    term_id TEXT NOT NULL REFERENCES terms(id),
    curriculum_id TEXT NOT NULL REFERENCES curricula(id),
    day INTEGER NOT NULL,
    period INTEGER NOT NULL,
    room_id TEXT,
    candidate_count INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    UNIQUE(term_id, day, period, room_id)
  );
  CREATE INDEX IF NOT EXISTS idx_placement_term ON curriculum_placements(term_id);
  CREATE INDEX IF NOT EXISTS idx_placement_curriculum ON curriculum_placements(curriculum_id);
`);

// M6 Voting tables
sqlite.exec(`
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
  CREATE INDEX IF NOT EXISTS idx_candidate_event ON voting_candidates(event_id);

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
  CREATE INDEX IF NOT EXISTS idx_vote_event ON votes(event_id);
  CREATE INDEX IF NOT EXISTS idx_vote_user ON votes(user_id);
`);

// API Clients table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS api_clients (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    client_id TEXT NOT NULL UNIQUE,
    client_secret_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    scopes TEXT NOT NULL DEFAULT '["calendar","reminders","schedules"]',
    is_active INTEGER NOT NULL DEFAULT 1,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_api_client_user ON api_clients(user_id);
  CREATE INDEX IF NOT EXISTS idx_api_client_client_id ON api_clients(client_id);
`);

// Reminders table
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    title TEXT NOT NULL,
    description TEXT,
    remind_at TEXT NOT NULL,
    repeat_rule TEXT NOT NULL DEFAULT 'none',
    status TEXT NOT NULL DEFAULT 'pending',
    source TEXT NOT NULL DEFAULT 'web',
    original_text TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reminder_user ON reminders(user_id);
  CREATE INDEX IF NOT EXISTS idx_reminder_status ON reminders(status);
  CREATE INDEX IF NOT EXISTS idx_reminder_remind_at ON reminders(remind_at);
`);

// ─── Issue #111 D1 / D2 / D3 / D4 プラグイン拡張テーブル ────

sqlite.exec(`
  CREATE TABLE IF NOT EXISTS issue_links (
    id TEXT PRIMARY KEY,
    from_type TEXT NOT NULL,
    from_id TEXT NOT NULL,
    to_type TEXT NOT NULL,
    to_id TEXT NOT NULL,
    link_type TEXT NOT NULL,
    created_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_link
    ON issue_links(from_type, from_id, to_type, to_id, link_type);
  CREATE INDEX IF NOT EXISTS idx_link_from ON issue_links(from_type, from_id);
  CREATE INDEX IF NOT EXISTS idx_link_to   ON issue_links(to_type, to_id);

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    reply_to TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_comment_target
    ON comments(target_type, target_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_comment_author ON comments(author_id);

  CREATE TABLE IF NOT EXISTS custom_field_values (
    id TEXT PRIMARY KEY,
    module_id TEXT NOT NULL,
    field_id TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    value TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE UNIQUE INDEX IF NOT EXISTS uniq_cfv
    ON custom_field_values(module_id, field_id, target_type, target_id);
  CREATE INDEX IF NOT EXISTS idx_cfv_target
    ON custom_field_values(target_type, target_id);

  CREATE TABLE IF NOT EXISTS workflow_transitions (
    id TEXT PRIMARY KEY,
    target_type TEXT NOT NULL,
    target_id TEXT NOT NULL,
    from_state TEXT NOT NULL,
    to_state TEXT NOT NULL,
    performed_by TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    performed_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_wf_target
    ON workflow_transitions(target_type, target_id, performed_at);
`);

console.log("Database tables initialized successfully.");
