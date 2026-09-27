/** Append-only confirmation history and task links; no task status is duplicated here. */
export const implementationDdl = [
  `CREATE TABLE IF NOT EXISTS pf_implementation_links (
    team_id TEXT NOT NULL, project_id TEXT NOT NULL, subject_kind TEXT NOT NULL, subject_id TEXT NOT NULL,
    task_id TEXT NOT NULL, specification_revision TEXT NOT NULL, is_backlog INTEGER NOT NULL DEFAULT 0,
    actor_id TEXT NOT NULL, note TEXT NOT NULL, linked_at TEXT NOT NULL,
    PRIMARY KEY(team_id, project_id, subject_kind, subject_id, task_id))`,
  `CREATE INDEX IF NOT EXISTS idx_pf_implementation_task ON pf_implementation_links(task_id)`,
  `CREATE TABLE IF NOT EXISTS pf_implementation_task_versions (task_id TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS pf_implementation_reviews (
    id TEXT PRIMARY KEY, team_id TEXT NOT NULL, project_id TEXT NOT NULL, subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL, fingerprint TEXT NOT NULL, actor_id TEXT NOT NULL, note TEXT NOT NULL, confirmed_at TEXT NOT NULL,
    UNIQUE(team_id, project_id, subject_kind, subject_id, fingerprint))`,
];
// Monotonic versions invalidate acceptance even when a task is reopened and completed within one second.
// Database triggers cover every task writer, including plugins and background workers.
export const implementationSqliteTriggers = ["UPDATE", "DELETE"].map(operation =>
  `CREATE TRIGGER IF NOT EXISTS pf_implementation_task_${operation.toLowerCase()} AFTER ${operation} ON tasks
   WHEN EXISTS (SELECT 1 FROM pf_implementation_links WHERE task_id = OLD.id)
   ${operation === "UPDATE" ? "AND (OLD.status IS NOT NEW.status OR OLD.title IS NOT NEW.title OR OLD.description IS NOT NEW.description OR OLD.requirements IS NOT NEW.requirements OR OLD.team_id IS NOT NEW.team_id)" : ""}
   BEGIN INSERT INTO pf_implementation_task_versions(task_id, revision) VALUES (OLD.id, 1)
   ON CONFLICT(task_id) DO UPDATE SET revision = revision + 1; END`);
export const implementationPostgresTriggers = [
  `CREATE OR REPLACE FUNCTION pf_implementation_task_changed() RETURNS trigger LANGUAGE plpgsql AS $$
   BEGIN IF TG_OP = 'UPDATE' AND ROW(OLD.status, OLD.title, OLD.description, OLD.requirements, OLD.team_id)
     IS NOT DISTINCT FROM ROW(NEW.status, NEW.title, NEW.description, NEW.requirements, NEW.team_id) THEN RETURN OLD; END IF;
   IF EXISTS (SELECT 1 FROM pf_implementation_links WHERE task_id = OLD.id) THEN
     INSERT INTO pf_implementation_task_versions(task_id, revision) VALUES (OLD.id, 1)
     ON CONFLICT(task_id) DO UPDATE SET revision = pf_implementation_task_versions.revision + 1;
   END IF; RETURN OLD; END $$`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'pf_implementation_task_changed' AND tgrelid = 'tasks'::regclass) THEN
   CREATE TRIGGER pf_implementation_task_changed AFTER UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION pf_implementation_task_changed();
   END IF; END $$`,
];
