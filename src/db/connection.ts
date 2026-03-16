import { drizzle } from "drizzle-orm/better-sqlite3";
import Database, { type Database as DatabaseType } from "better-sqlite3";
import * as schema from "./schema.js";
import * as curriculumSchema from "./curriculum-schema.js";
import { resolve } from "path";

const dbPath = process.env.DATABASE_PATH || resolve("data", "schedula.db");

// Ensure data directory exists
import { mkdirSync } from "fs";
mkdirSync(resolve("data"), { recursive: true });

const sqlite: DatabaseType = new Database(dbPath);

// Enable WAL mode for better concurrent read performance
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, {
  schema: { ...schema, ...curriculumSchema },
});

export { schema, curriculumSchema };
export { sqlite };
