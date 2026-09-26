import type postgres from "postgres";

/** Additive, atomic task migration; independent of optional calendar module DDL. */
export async function migratePlanningPostgres(pool: postgres.Sql): Promise<void> {
  await pool.begin(async sql => {
    await sql.unsafe(`SELECT pg_advisory_xact_lock(hashtextextended('actio-planning-schema', 0))`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS terpsichore_runs (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, project_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      task_ids TEXT NOT NULL, manifest_json TEXT NOT NULL, state TEXT NOT NULL, run_id TEXT, created_at TEXT NOT NULL
    )`);
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_terpsichore_active_run ON terpsichore_runs(team_id, project_id)
      WHERE state IN ('submitting', 'running', 'unknown')`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS terpsichore_plans (
      team_id TEXT NOT NULL, scope_key TEXT NOT NULL, input_json TEXT NOT NULL,
      revision INTEGER NOT NULL, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL,
      PRIMARY KEY(team_id, scope_key)
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, assignee_id TEXT, group_id TEXT, project_id TEXT,
      title TEXT NOT NULL, description TEXT, requirements TEXT, status TEXT NOT NULL DEFAULT 'open',
      priority TEXT NOT NULL DEFAULT 'medium', deadline TIMESTAMP, estimated_minutes INTEGER,
      plugin_id TEXT, plugin_ref TEXT, plugin_payload JSONB, completed_at TIMESTAMP,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(), updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )`);
    for (const [name, type] of Object.entries({
      team_id: "TEXT", lane: "TEXT NOT NULL DEFAULT 'daily'", sprint_id: "TEXT", source: "TEXT", source_ref: "TEXT",
      completed_by: "TEXT", completion_score: "DOUBLE PRECISION", completion_evidence: "JSONB", duration_days: "INTEGER",
      estimate_source: "TEXT", deadline_source: "TEXT", story_points: "INTEGER", blocked_by: "JSONB NOT NULL DEFAULT '[]'",
      carried_from_sprint_id: "TEXT", actual_minutes: "INTEGER NOT NULL DEFAULT 0",
      kind: "TEXT NOT NULL DEFAULT 'task'", creator_type: "TEXT NOT NULL DEFAULT 'human'", category: "TEXT",
      executor_type: "TEXT NOT NULL DEFAULT 'human'", ai_executor: "TEXT", is_critical_path: "BOOLEAN NOT NULL DEFAULT FALSE",
      slack_days: "DOUBLE PRECISION", critical_path_error: "TEXT", critical_path_computed_at: "TIMESTAMP",
    })) await sql.unsafe(`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS ${name} ${type}`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS project_refs (
      code TEXT PRIMARY KEY, name TEXT NOT NULL, team_ids JSONB NOT NULL, synced_at TIMESTAMP NOT NULL, removed_at TIMESTAMP
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS task_notifications (
      id TEXT PRIMARY KEY, task_id TEXT, team_id TEXT, event TEXT NOT NULL, channel TEXT NOT NULL,
      dedupe_key TEXT NOT NULL UNIQUE, payload JSONB NOT NULL, status TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT, created_at TIMESTAMP NOT NULL, sent_at TIMESTAMP
    )`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_task_notifications_status ON task_notifications(status)`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS team_refs (
      id TEXT PRIMARY KEY, slug TEXT NOT NULL, name TEXT NOT NULL, cc_settings JSONB NOT NULL,
      settings JSONB NOT NULL, synced_at TIMESTAMP NOT NULL
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS team_members (
      team_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL, PRIMARY KEY(team_id,user_id)
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS sprints (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, goal TEXT,
      starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, status TEXT NOT NULL,
      capacity_minutes INTEGER, approved_by TEXT, approved_at TIMESTAMPTZ,
      created_by TEXT NOT NULL, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
    )`);
    await sql.unsafe(`ALTER TABLE sprints ADD COLUMN IF NOT EXISTS cadence_days INTEGER,
      ADD COLUMN IF NOT EXISTS original_ends_on TEXT, ADD COLUMN IF NOT EXISTS buffer_ends_on TEXT,
      ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0`);
    await sql.unsafe(`UPDATE sprints SET original_ends_on = ends_on WHERE original_ends_on IS NULL`);
    await sql.unsafe(`UPDATE sprints SET buffer_ends_on = ends_on WHERE buffer_ends_on IS NULL`);
    await sql.unsafe(`UPDATE sprints SET cadence_days = GREATEST(1, ends_on::date - starts_on::date + 1) WHERE cadence_days IS NULL`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS backlog_groups (
      id TEXT PRIMARY KEY, team_id TEXT NOT NULL, name TEXT NOT NULL, reason TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS backlog_placements (
      task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
      group_id TEXT REFERENCES backlog_groups(id) ON DELETE SET NULL, position INTEGER NOT NULL DEFAULT 0
    )`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS sprint_changes (
      id TEXT PRIMARY KEY, sprint_id TEXT NOT NULL REFERENCES sprints(id), kind TEXT NOT NULL,
      actor_id TEXT NOT NULL, reason TEXT NOT NULL, before_json TEXT NOT NULL, after_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    await sql.unsafe(`ALTER TABLE sprint_changes ADD COLUMN IF NOT EXISTS event_order BIGINT GENERATED ALWAYS AS IDENTITY`);
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS task_spec_reviews (
      id TEXT PRIMARY KEY, task_id TEXT NOT NULL, actor_id TEXT NOT NULL, reason TEXT NOT NULL,
      before_json TEXT NOT NULL, after_json TEXT NOT NULL, spec_json TEXT NOT NULL, created_at TEXT NOT NULL
    )`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sprint_team ON sprints(team_id)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_sprint_changes ON sprint_changes(sprint_id,created_at)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_task_spec_reviews ON task_spec_reviews(task_id,created_at)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_task_team_lane ON tasks(team_id,lane)`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_task_sprint ON tasks(sprint_id)`);
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS uniq_task_source_ref ON tasks(source,source_ref) WHERE source IS NOT NULL AND source_ref IS NOT NULL`);
    // Do not collapse existing duplicates; incompatible data fails the migration for review.
    await sql.unsafe(`CREATE UNIQUE INDEX IF NOT EXISTS idx_pf_review_source ON tasks(source_ref) WHERE source = 'praeforma-review'`);
  });
}
