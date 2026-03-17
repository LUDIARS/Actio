/**
 * データベースデータのインポート
 *
 * db-export.ts で出力したJSONファイルからDBにデータを復元する。
 * スキーマ不一致の場合はエラーで停止する。
 *
 * Usage: npx tsx scripts/db-import.ts [input-path]
 *   デフォルト入力元: data/db-export.json
 *
 * 注意: 既存データは上書きされます（UPSERT動作: 競合時はスキップ）
 */

import fs from "fs";

const INPUT_PATH = process.argv[2] || "data/db-export.json";

interface ExportData {
  exportedAt: string;
  version: number;
  dialect: string;
  schemaHash: string;
  tables: Record<string, unknown[]>;
}

function computeSchemaHash(schema: Record<string, unknown>, curriculumSchema: Record<string, unknown>): string {
  const tableNames = [
    ...Object.keys(schema).sort(),
    ...Object.keys(curriculumSchema).sort(),
  ];
  return tableNames.join(",");
}

// テーブルの挿入順序（外部キー制約を考慮）
const INSERT_ORDER = [
  // 親テーブル
  "users",
  "rooms",
  "departments",
  "instructors",
  // 子テーブル
  "sessions",
  "groups",
  "curricula",
  "curriculumDepartments",
  "instructorAvailableSlots",
  "scheduleEntries",
  "unifiedSlots",
  "memberProfiles",
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
];

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`[db-import] ファイルが見つかりません: ${INPUT_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  let data: ExportData;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("[db-import] JSONパースエラー");
    process.exit(1);
  }

  if (data.version !== 1) {
    console.error(`[db-import] 未対応バージョン: ${data.version}`);
    process.exit(1);
  }

  // DB接続
  const { db, schema, curriculumSchema, dialect } = await import("../src/db/connection.js");

  // スキーマ互換性チェック
  const currentHash = computeSchemaHash(schema, curriculumSchema);
  if (data.schemaHash !== currentHash) {
    console.error(`[db-import] スキーマ不一致エラー!`);
    console.error(`  エクスポート時: ${data.schemaHash}`);
    console.error(`  現在のスキーマ: ${currentHash}`);
    console.error(`  エクスポート方言: ${data.dialect}, 現在の方言: ${dialect}`);
    console.error(`\nスキーマが変更されています。マイグレーションを実行してからインポートしてください。`);
    process.exit(1);
  }

  console.log(`[db-import] DB方言: ${dialect}`);
  console.log(`[db-import] エクスポート日時: ${data.exportedAt}`);
  console.log(`[db-import] スキーマハッシュ: OK (一致)`);

  // テーブルマッピング
  const allSchemas: Record<string, unknown> = { ...schema, ...curriculumSchema };

  let totalInserted = 0;
  let totalSkipped = 0;

  // 挿入順序に従ってインポート
  for (const tableName of INSERT_ORDER) {
    const rows = data.tables[tableName];
    if (!rows || rows.length === 0) continue;

    const table = allSchemas[tableName];
    if (!table) {
      console.warn(`[db-import] テーブル '${tableName}' がスキーマに存在しません（スキップ）`);
      continue;
    }

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        await db.insert(table).values(row as Record<string, unknown>);
        inserted++;
      } catch (err) {
        const msg = (err as Error).message || "";
        // UNIQUE制約違反は既存データとしてスキップ
        if (msg.includes("UNIQUE") || msg.includes("unique") || msg.includes("duplicate") || msg.includes("already exists")) {
          skipped++;
        } else {
          console.warn(`  [${tableName}] 挿入エラー: ${msg}`);
          skipped++;
        }
      }
    }

    totalInserted += inserted;
    totalSkipped += skipped;
    console.log(`  ${tableName}: ${inserted} 挿入, ${skipped} スキップ (全${rows.length}行)`);
  }

  // INSERT_ORDER に含まれないテーブルも処理
  for (const tableName of Object.keys(data.tables)) {
    if (INSERT_ORDER.includes(tableName)) continue;
    const rows = data.tables[tableName];
    if (!rows || rows.length === 0) continue;

    const table = allSchemas[tableName];
    if (!table) continue;

    let inserted = 0;
    let skipped = 0;

    for (const row of rows) {
      try {
        await db.insert(table).values(row as Record<string, unknown>);
        inserted++;
      } catch {
        skipped++;
      }
    }

    totalInserted += inserted;
    totalSkipped += skipped;
    console.log(`  ${tableName}: ${inserted} 挿入, ${skipped} スキップ (全${rows.length}行)`);
  }

  console.log(`\n[db-import] インポート完了`);
  console.log(`  挿入: ${totalInserted} 行`);
  console.log(`  スキップ: ${totalSkipped} 行`);

  process.exit(0);
}

main();
