import { defineConfig } from "drizzle-kit";
import { applyLocalConfig } from "./src/config/local-config.js";
applyLocalConfig();

const dialect = (process.env.DB_DIALECT || "postgres") as "sqlite" | "postgresql" | "mysql";

const dialectMap: Record<string, "sqlite" | "postgresql" | "mysql"> = {
  sqlite: "sqlite",
  postgres: "postgresql",
  mysql: "mysql",
};

const schemaMap: Record<string, string[]> = {
  sqlite: ["./src/db/schema.ts", "./src/db/curriculum-schema.ts"],
  postgres: ["./src/db/dialects/postgres.ts", "./src/db/pm-postgres-schema.ts"],
  mysql: ["./src/db/dialects/mysql.ts"],
};

if (!dialectMap[dialect]) throw new Error("Unsupported DB_DIALECT");
const resolvedDialect = dialectMap[dialect];
if (resolvedDialect !== "sqlite" && !process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");

export default defineConfig({
  schema: schemaMap[dialect] || schemaMap.sqlite,
  out: "./drizzle",
  dialect: resolvedDialect,
  dbCredentials:
    resolvedDialect === "sqlite"
      ? { url: process.env.DATABASE_PATH || "data/actio.db" }
      : { url: process.env.DATABASE_URL || "" },
});
