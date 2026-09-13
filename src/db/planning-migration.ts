import type { SqliteDatabase } from "./dialects/sqlite.js";

/** Shared by normal startup and db:init; inspect columns rather than swallowing DDL errors. */
export function migratePlanning(sqlite: SqliteDatabase): void {
  sqlite.transaction(() => {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS sprints (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, goal TEXT,
        starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, status TEXT NOT NULL,
        capacity_minutes INTEGER, approved_by TEXT, approved_at INTEGER,
        created_by TEXT NOT NULL, created_at INTEGER, updated_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_sprint_team ON sprints(team_id);
      CREATE TABLE IF NOT EXISTS backlog_groups (
        id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL,
        reason TEXT NOT NULL, created_by TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS backlog_placements (
        task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
        group_id TEXT REFERENCES backlog_groups(id) ON DELETE SET NULL,
        position INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS sprint_changes (
        id TEXT PRIMARY KEY, sprint_id TEXT NOT NULL REFERENCES sprints(id),
        kind TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT NOT NULL,
        before_json TEXT NOT NULL, after_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sprint_changes ON sprint_changes(sprint_id, created_at);
      CREATE TABLE IF NOT EXISTS task_spec_reviews (
        id TEXT PRIMARY KEY, task_id TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT NOT NULL,
        before_json TEXT NOT NULL, after_json TEXT NOT NULL, spec_json TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_task_spec_reviews ON task_spec_reviews(task_id, created_at);
    `);
    const columns = new Set((sqlite.prepare("PRAGMA table_info(sprints)").all() as { name: string }[]).map(c => c.name));
    for (const [name, definition] of [
      ["cadence_days", "INTEGER"], ["original_ends_on", "TEXT"], ["revision", "INTEGER NOT NULL DEFAULT 0"],
      ["buffer_ends_on", "TEXT"],
    ]) {
      if (!columns.has(name)) sqlite.exec(`ALTER TABLE sprints ADD COLUMN ${name} ${definition}`);
    }
    // Historical rows retain their original period; no team cadence is silently imposed.
    sqlite.exec(`UPDATE sprints SET original_ends_on = ends_on WHERE original_ends_on IS NULL;
      UPDATE sprints SET buffer_ends_on = ends_on WHERE buffer_ends_on IS NULL;
      UPDATE sprints SET cadence_days = MAX(1, CAST(julianday(ends_on) - julianday(starts_on) AS INTEGER) + 1)
      WHERE cadence_days IS NULL;`);
  })();
}
