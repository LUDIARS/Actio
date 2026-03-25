/**
 * Database connection factory
 *
 * secretManager 経由で DB_DIALECT を取得し使用するデータベースを選択:
 *   - "sqlite" (デフォルト): SQLite (better-sqlite3)
 *   - "postgres": PostgreSQL (postgres.js)
 *   - "mysql": MySQL (mysql2)
 *
 * 接続先は DATABASE_URL (postgres/mysql) または DATABASE_PATH (sqlite) で設定。
 * Infisical 設定時はそこから、未設定時は process.env から取得される。
 */

import { secretManager } from "../config/secrets.js";

export type DbDialect = "sqlite" | "postgres" | "mysql";

const dialect: DbDialect =
  (secretManager.get("DB_DIALECT") as DbDialect) || "sqlite";

console.log(`[db:connection] DB_DIALECT = "${dialect}"`);
console.log(
  `[db:connection] DATABASE_URL = ${secretManager.get("DATABASE_URL") ? "(設定済み)" : "(未設定)"}`
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let curriculumSchema: any;

switch (dialect) {
  case "postgres": {
    console.log("[db:connection] PostgreSQL モジュールをロード中...");
    const pg = await import("./dialects/postgres.js");
    schema = pg.schema;
    curriculumSchema = pg.curriculumSchema;
    console.log(
      "[db:connection] PostgreSQL リトライ付き接続を開始します..."
    );
    db = await pg.createConnectionWithRetry();
    console.log("[db:connection] PostgreSQL 接続確立完了");
    break;
  }
  case "mysql": {
    console.log("[db:connection] MySQL モジュールをロード中...");
    const my = await import("./dialects/mysql.js");
    schema = my.schema;
    curriculumSchema = my.curriculumSchema;
    db = my.createConnection();
    console.log("[db:connection] MySQL 接続作成完了");
    break;
  }
  default: {
    console.log("[db:connection] SQLite モジュールをロード中...");
    const lite = await import("./dialects/sqlite.js");
    schema = lite.schema;
    curriculumSchema = lite.curriculumSchema;
    const conn = lite.createConnection();
    db = conn.db;
    console.log("[db:connection] SQLite 接続作成完了");
    break;
  }
}

console.log("[db:connection] データベース初期化完了");

export { db, schema, curriculumSchema, dialect };
