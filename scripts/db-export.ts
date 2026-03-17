/**
 * データベースデータのエクスポート
 *
 * 全テーブルのデータをJSONファイルに出力する。
 * 環境移行やバックアップに使用。
 *
 * Usage: npx tsx scripts/db-export.ts [output-path]
 *   デフォルト出力先: data/db-export.json
 */

const OUTPUT_PATH = process.argv[2] || "data/db-export.json";

// テーブル名の一覧（エクスポート対象）
const TABLE_NAMES = [
  "users",
  "sessions",
  "rooms",
  "scheduleEntries",
  "unifiedSlots",
  "memberProfiles",
  "groups",
  "groupMembers",
  "groupSchedules",
  "reservations",
  "personalEvents",
  "plans",
  "myPlans",
  "webhookEndpoints",
  "webhookDeliveryLogs",
  "notificationPreferences",
  "notifications",
  "votingEvents",
  "votingCandidates",
  "votes",
] as const;

const CURRICULUM_TABLE_NAMES = [
  "departments",
  "instructors",
  "curricula",
  "curriculumDepartments",
  "instructorAvailableSlots",
] as const;

interface ExportData {
  exportedAt: string;
  version: 1;
  dialect: string;
  schemaHash: string;
  tables: Record<string, unknown[]>;
}

/**
 * テーブルカラム名の一覧をスキーマハッシュとして生成
 * import時のスキーマ不一致検出に使用
 */
function computeSchemaHash(schema: Record<string, unknown>, curriculumSchema: Record<string, unknown>): string {
  const tableNames = [
    ...Object.keys(schema).sort(),
    ...Object.keys(curriculumSchema).sort(),
  ];
  return tableNames.join(",");
}

async function main() {
  // 動的にDB接続を取得
  const { db, schema, curriculumSchema, dialect } = await import("../src/db/connection.js");

  const schemaHash = computeSchemaHash(schema, curriculumSchema);

  const exportData: ExportData = {
    exportedAt: new Date().toISOString(),
    version: 1,
    dialect,
    schemaHash,
    tables: {},
  };

  console.log(`[db-export] DB方言: ${dialect}`);
  console.log(`[db-export] スキーマハッシュ: ${schemaHash}`);

  // メインスキーマのテーブルをエクスポート
  for (const tableName of TABLE_NAMES) {
    const table = schema[tableName];
    if (!table) {
      console.warn(`[db-export] テーブル '${tableName}' がスキーマに存在しません（スキップ）`);
      continue;
    }
    try {
      const rows = await db.select().from(table);
      exportData.tables[tableName] = rows;
      console.log(`  ${tableName}: ${rows.length} 行`);
    } catch (err) {
      console.warn(`[db-export] テーブル '${tableName}' の読み取りエラー（スキップ）:`, (err as Error).message);
      exportData.tables[tableName] = [];
    }
  }

  // カリキュラムスキーマのテーブルをエクスポート
  for (const tableName of CURRICULUM_TABLE_NAMES) {
    const table = curriculumSchema[tableName];
    if (!table) {
      console.warn(`[db-export] テーブル '${tableName}' がカリキュラムスキーマに存在しません（スキップ）`);
      continue;
    }
    try {
      const rows = await db.select().from(table);
      exportData.tables[tableName] = rows;
      console.log(`  ${tableName}: ${rows.length} 行`);
    } catch (err) {
      console.warn(`[db-export] テーブル '${tableName}' の読み取りエラー（スキップ）:`, (err as Error).message);
      exportData.tables[tableName] = [];
    }
  }

  // ファイル出力
  const fs = await import("fs");
  const path = await import("path");

  const outputDir = path.dirname(OUTPUT_PATH);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(exportData, null, 2), "utf-8");

  const totalRows = Object.values(exportData.tables).reduce((sum, rows) => sum + rows.length, 0);
  console.log(`\n[db-export] エクスポート完了`);
  console.log(`  テーブル数: ${Object.keys(exportData.tables).length}`);
  console.log(`  総行数: ${totalRows}`);
  console.log(`  出力先: ${OUTPUT_PATH}`);

  process.exit(0);
}

main();
