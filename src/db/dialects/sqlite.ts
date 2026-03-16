/**
 * SQLite dialect: schema definitions + connection factory
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import { resolve } from "path";
import { mkdirSync } from "fs";
import * as schema from "../schema.js";
import * as curriculumSchema from "../curriculum-schema.js";

export { schema, curriculumSchema };

export function createConnection() {
  const dbPath = process.env.DATABASE_PATH || resolve("data", "schedula.db");
  mkdirSync(resolve("data"), { recursive: true });

  const sqlite: DatabaseType = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  const db = drizzle(sqlite, {
    schema: { ...schema, ...curriculumSchema },
  });

  return { db, sqlite };
}
