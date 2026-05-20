/**
 * Redisセッションデータのインポート
 *
 * redis-export.ts で出力したJSONファイルからRedisにデータを復元する。
 * docker-compose再構築後にセッションを再現するために使用。
 *
 * Usage: npx tsx scripts/redis-import.ts [input-path]
 *   デフォルト入力元: data/redis-sessions.json
 */

import Redis from "ioredis";
import fs from "fs";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const INPUT_PATH = process.argv[2] || "data/redis-sessions.json";

interface ExportData {
  exportedAt: string;
  version: number;
  sessions: Array<{
    key: string;
    value: string;
    ttl: number;
  }>;
  refreshIndexes: Array<{
    key: string;
    value: string;
    ttl: number;
  }>;
}

async function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    console.error(`[redis-import] ファイルが見つかりません: ${INPUT_PATH}`);
    process.exit(1);
  }

  const raw = fs.readFileSync(INPUT_PATH, "utf-8");
  let data: ExportData;
  try {
    data = JSON.parse(raw);
  } catch {
    console.error("[redis-import] JSONパースエラー");
    process.exit(1);
  }

  if (data.version !== 1) {
    console.error(`[redis-import] 未対応バージョン: ${data.version}`);
    process.exit(1);
  }

  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  try {
    console.log(`[redis-import] Redis接続: ${REDIS_URL.replace(/\/\/.*@/, "//***:***@")}`);
    await redis.ping();
    console.log("[redis-import] 接続成功");
    console.log(`[redis-import] エクスポート日時: ${data.exportedAt}`);

    let restored = 0;
    let skipped = 0;

    // セッションデータ復元
    for (const entry of data.sessions) {
      if (entry.ttl <= 0) {
        skipped++;
        continue;
      }
      await redis.set(entry.key, entry.value, "EX", entry.ttl);
      restored++;
    }

    // リフレッシュインデックス復元
    for (const entry of data.refreshIndexes) {
      if (entry.ttl <= 0) {
        skipped++;
        continue;
      }
      await redis.set(entry.key, entry.value, "EX", entry.ttl);
      restored++;
    }

    console.log(`[redis-import] インポート完了`);
    console.log(`  復元: ${restored} キー`);
    console.log(`  スキップ(TTL切れ): ${skipped} キー`);
  } catch (err) {
    console.error("[redis-import] エラー:", err);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
