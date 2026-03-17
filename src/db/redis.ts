/**
 * Redis接続モジュール
 *
 * REDIS_URL が設定されていれば Redis に接続する。
 * 接続失敗やエラー時はログを出力し、呼び出し元がフォールバック処理を行う。
 */

import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "";

let redis: Redis | null = null;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          console.warn("[redis] 再接続上限到達、停止");
          return null;
        }
        const delay = Math.min(times * 500, 3000);
        console.log(`[redis] ${delay}ms 後に再接続 (${times}回目)`);
        return delay;
      },
      lazyConnect: false,
    });

    redis.on("connect", () => {
      console.log("[redis] 接続成功");
    });

    redis.on("error", (err) => {
      console.error("[redis] エラー:", err.message);
    });

    redis.on("close", () => {
      console.warn("[redis] 接続切断");
    });
  } catch (err) {
    console.error("[redis] 初期化失敗:", err);
    redis = null;
  }
} else {
  console.log("[redis] REDIS_URL 未設定 — DBフォールバックを使用");
}

/**
 * Redis クライアントを返す。未接続なら null。
 */
export function getRedis(): Redis | null {
  if (!redis) return null;
  if (redis.status !== "ready" && redis.status !== "connect") return null;
  return redis;
}

export { redis };
