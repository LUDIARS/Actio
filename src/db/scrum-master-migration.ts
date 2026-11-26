// @spec スクラムマスターの保存データ
/** Additive DDL shared by SQLite and PostgreSQL. */
export const scrumMasterDdl = [
  `CREATE TABLE IF NOT EXISTS sprint_scrum_masters (
    team_id TEXT PRIMARY KEY,
    holder TEXT NOT NULL CHECK(holder = 'terpsichore'),
    client_id TEXT,
    assigned_by TEXT NOT NULL,
    assigned_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sprint_scrum_master_events (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL,
    sprint_id TEXT,
    action TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    gate_event_id TEXT,
    created_at TEXT NOT NULL
  )`,
];
