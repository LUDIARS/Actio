import { defineConfig } from "drizzle-kit";

const dialect = (process.env.DB_DIALECT || "sqlite") as "sqlite" | "postgresql" | "mysql";

const dialectMap: Record<string, "sqlite" | "postgresql" | "mysql"> = {
  sqlite: "sqlite",
  postgres: "postgresql",
  mysql: "mysql",
};

const schemaMap: Record<string, string[]> = {
  sqlite: ["./src/db/schema.ts", "./src/db/curriculum-schema.ts"],
  postgres: ["./src/db/dialects/postgres.ts"],
  mysql: ["./src/db/dialects/mysql.ts"],
};

const resolvedDialect = dialectMap[dialect] || "sqlite";

export default defineConfig({
  schema: schemaMap[dialect] || schemaMap.sqlite,
  out: "./drizzle",
  dialect: resolvedDialect,
  dbCredentials:
    resolvedDialect === "sqlite"
      ? { url: process.env.DATABASE_PATH || "data/actio.db" }
      : { url: process.env.DATABASE_URL || "" },
});
