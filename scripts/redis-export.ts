/**
 * Redisセッションデータのエクスポート
 *
 * 現在のRedisに保存されているセッションデータをJSONファイルに出力する。
 * docker-compose再構築時にデータを保持するために使用。
 *
 * Usage: npx tsx scripts/redis-export.ts [output-path]
 *   デフォルト出力先: data/redis-sessions.json
 */

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const OUTPUT_PATH = process.argv[2] || "data/redis-sessions.json";

const SESSION_PREFIX = "session:";
const REFRESH_INDEX_PREFIX = "refresh:";

interface ExportData {
  exportedAt: string;
  version: 1;
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
  const redis = new Redis(REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
  });

  try {
    console.log(`[redis-export] Redis接続: ${REDIS_URL.replace(/\/\/.*@/, "//***:***@")}`);
    await redis.ping();
    console.log("[redis-export] 接続成功");

    const exportData: ExportData = {
      exportedAt: new Date().toISOString(),
      version: 1,
      sessions: [],
      refreshIndexes: [],
    };

    // session:* キーをスキャン
    let cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${SESSION_PREFIX}*`, "COUNT", 100);
      cursor = nextCursor;

      for (const key of keys) {
        const value = await redis.get(key);
        const ttl = await redis.ttl(key);
        if (value && ttl > 0) {
          exportData.sessions.push({ key, value, ttl });
        }
      }
    } while (cursor !== "0");

    // refresh:* キーをスキャン
    cursor = "0";
    do {
      const [nextCursor, keys] = await redis.scan(cursor, "MATCH", `${REFRESH_INDEX_PREFIX}*`, "COUNT", 100);
      cursor = nextCursor;

      for (const key of keys) {
        const value = await redis.get(key);
        const ttl = await redis.ttl(key);
        if (value && ttl > 0) {
          exportData.refreshIndexes.push({ key, value, ttl });
        }
      }
    } while (cursor !== "0");

    // ファイル出力
    const fs = await import("fs");
    const path = await import("path");

    const outputDir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(exportData, null, 2), "utf-8");

    console.log(`[redis-export] エクスポート完了`);
    console.log(`  セッション数: ${exportData.sessions.length}`);
    console.log(`  リフレッシュインデックス数: ${exportData.refreshIndexes.length}`);
    console.log(`  出力先: ${OUTPUT_PATH}`);
  } catch (err) {
    console.error("[redis-export] エラー:", err);
    process.exit(1);
  } finally {
    await redis.quit();
  }
}

main();
