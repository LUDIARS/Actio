/**
 * Database connection factory
 *
 * 環境変数 DB_DIALECT で使用するデータベースを選択:
 *   - "sqlite" (デフォルト): SQLite (better-sqlite3)
 *   - "postgres": PostgreSQL (postgres.js)
 *   - "mysql": MySQL (mysql2)
 *
 * 接続先は DATABASE_URL (postgres/mysql) または DATABASE_PATH (sqlite) で設定
 */

export type DbDialect = "sqlite" | "postgres" | "mysql";

const dialect: DbDialect = (process.env.DB_DIALECT as DbDialect) || "sqlite";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let schema: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let curriculumSchema: any;

switch (dialect) {
  case "postgres": {
    const pg = await import("./dialects/postgres.js");
    schema = pg.schema;
    curriculumSchema = pg.curriculumSchema;
    db = pg.createConnection();
    break;
  }
  case "mysql": {
    const my = await import("./dialects/mysql.js");
    schema = my.schema;
    curriculumSchema = my.curriculumSchema;
    db = my.createConnection();
    break;
  }
  default: {
    const lite = await import("./dialects/sqlite.js");
    schema = lite.schema;
    curriculumSchema = lite.curriculumSchema;
    const conn = lite.createConnection();
    db = conn.db;
    break;
  }
}

export { db, schema, curriculumSchema, dialect };
