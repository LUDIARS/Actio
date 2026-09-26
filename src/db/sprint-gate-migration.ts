// @spec スプリントフェーズの永続化と復旧
/** Shared additive DDL; text JSON keeps both supported planning dialects identical. */
export const sprintGateDdl = [
    `CREATE TABLE IF NOT EXISTS sprint_gates(team_id TEXT NOT NULL,sprint_id TEXT NOT NULL,revision INTEGER NOT NULL,state_json TEXT NOT NULL,retrospective TEXT NOT NULL DEFAULT '',next_sprint_id TEXT,PRIMARY KEY(team_id,sprint_id))`,
    `CREATE TABLE IF NOT EXISTS sprint_gate_history(event_id TEXT PRIMARY KEY,team_id TEXT NOT NULL,sprint_id TEXT NOT NULL,action TEXT NOT NULL,actor_id TEXT,reason TEXT NOT NULL,phase TEXT NOT NULL,revision INTEGER NOT NULL,created_at TEXT NOT NULL,state_json TEXT NOT NULL,snapshot_json TEXT NOT NULL)`,
    `CREATE INDEX IF NOT EXISTS idx_sprint_gate_history ON sprint_gate_history(team_id,sprint_id,revision)`,
    `CREATE TABLE IF NOT EXISTS sprint_gate_outbox(team_id TEXT NOT NULL,sprint_id TEXT NOT NULL,revision INTEGER NOT NULL,payload_json TEXT NOT NULL,status TEXT NOT NULL,thread_url TEXT,last_error TEXT,PRIMARY KEY(team_id,sprint_id))`,
    `CREATE TABLE IF NOT EXISTS sprint_gate_events(event_id TEXT PRIMARY KEY,team_id TEXT NOT NULL,sprint_id TEXT NOT NULL,request_hash TEXT NOT NULL,outcome TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL)`,
];
