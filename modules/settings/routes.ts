/**
 * Settings module — アプリ設定のGUI管理 + DBエクスポート
 *
 * 管理者のみアクセス可能。key-value形式で設定を保存し、
 * セッション有効期間など動的に変更可能な設定を管理する。
 */

import { Hono } from "hono";
import { requireRole } from "../../src/middleware/auth.js";
import { appSettingsRepo } from "../../src/db/repository.js";
import { db, dialect } from "../../src/db/connection.js";
import { sql } from "drizzle-orm";

const settingsRoutes = new Hono();

// 全エンドポイントに管理者権限を要求
settingsRoutes.use("*", requireRole("admin"));

// ─── デフォルト設定値 ──────────────────────────────────────────
export const SETTING_DEFAULTS: Record<string, string> = {
  "session.refreshTokenDays": "30",
  "session.accessTokenMinutes": "60",
  "app.name": "Schedula",
};

/**
 * 設定値を取得するヘルパー（他モジュールからも利用可能）
 */
export async function getSettingValue(key: string): Promise<string> {
  const row = await appSettingsRepo.findByKey(key);
  return row?.value ?? SETTING_DEFAULTS[key] ?? "";
}

// ─── GET / - 全設定を取得 ───────────────────────────────────
settingsRoutes.get("/", async (c) => {
  try {
    const rows = await appSettingsRepo.findAll();
    // デフォルト値とマージ（DB値が優先）
    const settings: Record<string, string> = { ...SETTING_DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }
    return c.json({ settings });
  } catch (err) {
    console.error("[settings] 取得エラー:", err);
    return c.json({ error: "設定の取得に失敗しました" }, 500);
  }
});

// ─── PUT / - 設定を一括更新 ─────────────────────────────────
settingsRoutes.put("/", async (c) => {
  try {
    const body = await c.req.json<{ settings: Record<string, string> }>();
    if (!body.settings || typeof body.settings !== "object") {
      return c.json({ error: "settings オブジェクトが必要です" }, 400);
    }

    for (const [key, value] of Object.entries(body.settings)) {
      if (typeof value !== "string") continue;
      await appSettingsRepo.upsert(key, value);
    }

    // 更新後の値を返す
    const rows = await appSettingsRepo.findAll();
    const settings: Record<string, string> = { ...SETTING_DEFAULTS };
    for (const row of rows) {
      settings[row.key] = row.value;
    }

    return c.json({ settings, message: "設定を保存しました" });
  } catch (err) {
    console.error("[settings] 更新エラー:", err);
    return c.json({ error: "設定の保存に失敗しました" }, 500);
  }
});

// ─── DB execute ヘルパー (db-viewer と同様) ──────────────────
function extractRows(result: any): any[] {
  if (Array.isArray(result)) {
    if (result.length === 2 && Array.isArray(result[0])) {
      return result[0];
    }
    return result;
  }
  if (result && Array.isArray(result.rows)) {
    return result.rows;
  }
  return [];
}

function quoteIdent(name: string): string {
  if (dialect === "mysql") return `\`${name}\``;
  return `"${name}"`;
}

// ─── GET /export - DB全テーブルをJSON形式でエクスポート ───────
settingsRoutes.get("/export", async (c) => {
  try {
    // テーブル一覧を取得
    let tableNames: string[] = [];
    if (dialect === "sqlite") {
      const result = await db.execute(
        sql`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__%' ORDER BY name`
      );
      tableNames = extractRows(result).map((r: any) => r.name);
    } else if (dialect === "postgres") {
      const result = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name`
      );
      tableNames = extractRows(result).map((r: any) => r.table_name);
    } else if (dialect === "mysql") {
      const result = await db.execute(
        sql`SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`
      );
      tableNames = extractRows(result).map((r: any) => r.table_name || r.TABLE_NAME);
    }

    // 各テーブルのデータを取得
    const exportData: Record<string, any[]> = {};
    for (const tableName of tableNames) {
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(tableName)) continue;
      const quoted = quoteIdent(tableName);
      const result = await db.execute(sql.raw(`SELECT * FROM ${quoted}`));
      exportData[tableName] = extractRows(result);
    }

    const exportPayload = {
      exportedAt: new Date().toISOString(),
      dialect,
      tables: exportData,
    };

    // JSONファイルとしてダウンロード
    c.header("Content-Type", "application/json");
    c.header(
      "Content-Disposition",
      `attachment; filename="schedula-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    return c.body(JSON.stringify(exportPayload, null, 2));
  } catch (err) {
    console.error("[settings:export] エクスポートエラー:", err);
    return c.json({ error: "DBエクスポートに失敗しました" }, 500);
  }
});

export { settingsRoutes };
