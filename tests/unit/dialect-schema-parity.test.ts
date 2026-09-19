import { describe, expect, it } from "vitest";
// Static imports: Vite cannot resolve a dynamic import built from a variable path.
import * as mysqlDialect from "../../src/db/dialects/mysql.js";
import * as postgresDialect from "../../src/db/dialects/postgres.js";
import * as sqliteDialect from "../../src/db/dialects/sqlite.js";

/**
 * repository は connection.ts が方言ごとに選ぶ `schema` オブジェクト越しにテーブルを引く。
 * 個別 export だけ足して一覧に入れ忘れると、 起動はできても実行時に
 * "Cannot read properties of undefined (reading 'Symbol(drizzle:Columns)')" で落ちる
 * (2026-09-19 に task_notifications / project_refs で実際に起きた)。
 */
const REQUIRED_TABLES = [
  "users", "tasks", "events", "teamRefs", "teamMembers", "projectRefs", "taskNotifications",
] as const;

const DIALECTS: ReadonlyArray<[string, Record<string, unknown>]> = [
  ["sqlite", sqliteDialect.schema as unknown as Record<string, unknown>],
  ["postgres", postgresDialect.schema as unknown as Record<string, unknown>],
  ["mysql", mysqlDialect.schema as unknown as Record<string, unknown>],
];

describe("dialect schema parity", () => {
  it.each(DIALECTS)("%s exposes every table the repository uses", (dialect, schema) => {
    const names = Object.keys(schema);
    for (const table of REQUIRED_TABLES) {
      expect(names, `${dialect}.schema.${table}`).toContain(table);
    }
  });
});
