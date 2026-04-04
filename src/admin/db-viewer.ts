/**
 * Admin DB Viewer API
 * テスト用: 管理者のみ全DBテーブルを閲覧可能
 */
import { Hono } from "hono";
import { requireRole } from "../middleware/auth.js";
import { db, dialect } from "../db/connection.js";
import { sql } from "drizzle-orm";
import { extractRows } from "../db/utils.js";

const dbViewer = new Hono();

// 全エンドポイントに管理者権限を要求
dbViewer.use("*", requireRole("admin"));

/**
 * テーブル名をSQL識別子として引用符で囲む (方言対応)
 */
function quoteIdent(name: string): string {
  if (dialect === "mysql") {
    return `\`${name}\``;
  }
  return `"${name}"`; // SQLite, PostgreSQL
}

/**
 * GET /tables - テーブル一覧を取得
 */
dbViewer.get("/tables", async (c) => {
  try {
    let tables: string[] = [];

    if (dialect === "sqlite") {
      const result = await db.execute(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__%' ORDER BY name`
      );
      tables = extractRows(result).map((r) => String(r.name));
    } else if (dialect === "postgres") {
      const result = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      );
      tables = extractRows(result).map((r) => String(r.table_name));
    } else if (dialect === "mysql") {
      const result = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`
      );
      tables = extractRows(result).map((r) => String(r.table_name || r.TABLE_NAME));
    }

    return c.json({ tables });
  } catch (err) {
    console.error("[admin:db-viewer] テーブル一覧取得エラー:", err);
    return c.json({ error: "テーブル一覧の取得に失敗しました", detail: String(err) }, 500);
  }
});

/**
 * GET /tables/:tableName - テーブルデータを取得 (ページネーション対応)
 */
dbViewer.get("/tables/:tableName", async (c) => {
  const tableName = c.req.param("tableName");
  const limit = Math.min(parseInt(c.req.query("limit") || "50", 10), 500);
  const offset = parseInt(c.req.query("offset") || "0", 10);

  // テーブル名のバリデーション (SQLインジェクション防止)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) {
    return c.json({ error: "無効なテーブル名です" }, 400);
  }

  const quoted = quoteIdent(tableName);

  try {
    // カラム情報を取得
    let columns: string[] = [];
    if (dialect === "sqlite") {
      const colInfo = await db.execute(
        sql.raw(`PRAGMA table_info(${quoted})`)
      );
      columns = extractRows(colInfo).map((r) => String(r.name));
    } else if (dialect === "postgres") {
      const colInfo = await db.execute(
        sql`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} ORDER BY ordinal_position`
      );
      columns = extractRows(colInfo).map((r) => String(r.column_name));
    } else if (dialect === "mysql") {
      const colInfo = await db.execute(
        sql`SELECT column_name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ${tableName} ORDER BY ordinal_position`
      );
      columns = extractRows(colInfo).map((r) => String(r.column_name || r.COLUMN_NAME));
    }

    if (columns.length === 0) {
      return c.json({ error: "テーブルが見つかりません" }, 404);
    }

    // 行数を取得
    const countResult = await db.execute(
      sql.raw(`SELECT COUNT(*) as count FROM ${quoted}`)
    );
    const countRows = extractRows(countResult);
    const totalRows = Number(countRows[0]?.count ?? countRows[0]?.["COUNT(*)"] ?? 0);

    // データを取得
    const dataResult = await db.execute(
      sql.raw(`SELECT * FROM ${quoted} LIMIT ${limit} OFFSET ${offset}`)
    );
    const rows = extractRows(dataResult);

    return c.json({
      table: tableName,
      columns,
      rows,
      totalRows,
      limit,
      offset,
    });
  } catch (err) {
    console.error(`[admin:db-viewer] テーブル "${tableName}" 取得エラー:`, err);
    return c.json({ error: "テーブルデータの取得に失敗しました", detail: String(err) }, 500);
  }
});

export { dbViewer };
