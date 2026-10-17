import type postgres from "postgres";

/**
 * groups / group_members / group_schedules の追加専用 DDL (dialects/postgres.ts の pgTable と同じ列)。
 * Postgres には drizzle のマイグレーションファイルが無く、起動時の自動作成にも入っていなかったため、
 * 新規 DB では /api/groups が relation "groups" does not exist で 500 になり、groups を参照する
 * holidays / group_events / user_project_roles などの自動作成も連鎖して失敗していた。
 * 冪等 (IF NOT EXISTS) なので既存 DB に対しては何もしない。 users より後に流すこと。
 */
export const groupDdl: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_by TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES groups(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    role TEXT NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_group_member UNIQUE (group_id, user_id)
  )`,
  `CREATE INDEX IF NOT EXISTS idx_group_member_user ON group_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_member_group ON group_members(group_id)`,
  `CREATE TABLE IF NOT EXISTS group_schedules (
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
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_group_schedule_group ON group_schedules(group_id)`,
  `CREATE INDEX IF NOT EXISTS idx_group_schedule_date ON group_schedules(date)`,
];

export async function migrateGroupPostgres(pool: Pick<postgres.Sql, "unsafe">): Promise<void> {
  for (const ddl of groupDdl) await pool.unsafe(ddl);
}
