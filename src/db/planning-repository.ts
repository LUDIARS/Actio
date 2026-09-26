import type postgres from "postgres";
import { db, dialect } from "./connection.js";
import type { SqliteDatabase } from "./dialects/sqlite.js";
import { PlanningPostgres } from "./planning-postgres.js";
import { BacklogStore } from "../../modules/task/planning/backlog-store.js";
import { SprintStore } from "../../modules/task/planning/sprint-store.js";
import { SpecImportStore } from "../../modules/task/planning/spec-import-store.js";
import { PostgresBacklogStore } from "../../modules/task/planning/postgres-backlog-store.js";
import { PostgresSprintStore } from "../../modules/task/planning/postgres-sprint-store.js";
import { PostgresSpecImportStore } from "../../modules/task/planning/postgres-spec-import-store.js";
import { GuidancePlanStore } from "../../modules/task/terpsichore/plan-store.js";
import { ExecutionStore } from "../../modules/task/terpsichore/execution-store.js";

/** Routes depend on repositories, never native database handles. */
export function planningRepositories() {
  if (dialect === "postgres") {
    const client = new PlanningPostgres(db.$client as postgres.Sql);
    return { backlog: new PostgresBacklogStore(client), sprints: new PostgresSprintStore(client), specs: new PostgresSpecImportStore(client), guidance: new GuidancePlanStore(client), executions: new ExecutionStore(client) };
  }
  if (dialect !== "sqlite") throw new Error("Planning requires PostgreSQL or SQLite");
  const client = db.$client as SqliteDatabase;
  return { backlog: new BacklogStore(client), sprints: new SprintStore(client), specs: new SpecImportStore(client), guidance: new GuidancePlanStore(client), executions: new ExecutionStore(client) };
}
