// @implements AT-SPRINT-CHAT-INTEGRATION
/** One versioned document per aggregate; indexed state supports recoverable workers. */
export const chatDdl = [
  `CREATE TABLE IF NOT EXISTS task_chat_records (
    team_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,
    state TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,updated_at TEXT NOT NULL,
    PRIMARY KEY(team_id,kind,id))`,
  `CREATE INDEX IF NOT EXISTS idx_task_chat_pending ON task_chat_records(kind,state,updated_at)`,
  `CREATE TABLE IF NOT EXISTS task_chat_lease (
    id TEXT PRIMARY KEY,owner TEXT NOT NULL,expires_at TEXT NOT NULL)`,
];
