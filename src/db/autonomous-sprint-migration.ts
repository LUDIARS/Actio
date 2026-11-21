// @spec AT-AUTONOMOUS-SPRINT
/** Additive DDL shared by SQLite and PostgreSQL. */
export const autonomousSprintDdl = [
  `CREATE TABLE IF NOT EXISTS autonomous_sprint_runs (
    id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL UNIQUE,
    sprint_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'paused')),
    revision INTEGER NOT NULL,
    cycle INTEGER NOT NULL,
    stalled_after_minutes INTEGER NOT NULL,
    next_sprint_id TEXT,
    claim_id TEXT,
    task_id TEXT,
    claimed_at TEXT,
    warning TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS autonomous_sprint_events (
    run_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    team_id TEXT NOT NULL,
    sprint_id TEXT NOT NULL,
    action TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    state_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY(run_id, revision)
  )`,
];
