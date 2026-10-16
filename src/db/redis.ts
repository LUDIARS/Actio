/**
 * Redis接続モジュール
 *
 * REDIS_URL が設定されていれば Redis に接続する。Redis はキャッシュ専用で必須ではない。
 * 未設定・停止中・応答しない場合は getRedis() が null を返すか、コマンドが短時間で失敗し、
 * 呼び出し元はキャッシュ無しで処理を続ける。振る舞いの根拠は redis-policy.ts。
 */

import Redis from "ioredis";
import { secretManager } from "../config/secrets.js";
import {
  isRedisUsable,
  redisReconnectDelay,
  REDIS_COMMAND_TIMEOUT_MS,
  REDIS_CONNECT_TIMEOUT_MS,
  shouldLogReconnect,
} from "./redis-policy.js";

const REDIS_URL = secretManager.getOrDefault("REDIS_URL", "");

let redis: Redis | null = null;

if (REDIS_URL) {
  try {
    redis = new Redis(REDIS_URL, {
      // 切断中のコマンドは溜めずに即失敗させる (待たせない)
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
      retryStrategy(times) {
        const delay = redisReconnectDelay(times);
        if (shouldLogReconnect(times)) console.log(`[redis] ${delay}ms 後に再接続 (${times}回目)`);
        return delay;
      },
      lazyConnect: false,
    });

    redis.on("ready", () => {
      console.log("[redis] 接続成功");
    });

    redis.on("error", (err) => {
      console.error("[redis] エラー:", err.message);
    });

    redis.on("close", () => {
      console.warn("[redis] 接続切断 (キャッシュ無しで続行)");
    });
  } catch (err) {
    console.error("[redis] 初期化失敗 (キャッシュ無しで続行):", err);
    redis = null;
  }
} else {
  console.log("[redis] REDIS_URL 未設定 — キャッシュ無しで動作");
}

/**
 * Redis クライアントを返す。ready でなければ null (呼び出し元はキャッシュ無しで続ける)。
 */
export function getRedis(): Redis | null {
  if (!redis) return null;
  if (!isRedisUsable(redis.status)) return null;
  return redis;
}

export { redis };
