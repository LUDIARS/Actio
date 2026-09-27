// @implements AT-SPRINT-CHAT-INTEGRATION
import type postgres from "postgres";
import { db, dialect } from "./connection.js";
import type { SqliteDatabase } from "./dialects/sqlite.js";
import { PlanningPostgres } from "./planning-postgres.js";
import { sqliteGateDatabase, postgresGateDatabase } from "./sprint-gate-database.js";
import { ChatRecords } from "../../modules/task/chat/records.js";

export function chatRecords(): ChatRecords {
  if (dialect === "postgres") return new ChatRecords(postgresGateDatabase(new PlanningPostgres(db.$client as postgres.Sql)));
  if (dialect === "sqlite") return new ChatRecords(sqliteGateDatabase(db.$client as SqliteDatabase));
  throw new Error("Chat planning requires PostgreSQL or SQLite");
}
