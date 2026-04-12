/**
 * セッションユーザーキャッシュ (Redis)
 *
 * 認証成功時にユーザー情報を Redis にキャッシュし、
 * 以降のリクエストで DB アクセスを削減する。
 * Redis 未接続時は何もしない (フォールバック: DB 問い合わせ)。
 */

import { getRedis } from "../db/redis.js";

const SESSION_KEY_PREFIX = "schedula:session:user:";
const DEFAULT_TTL = 3600; // 1時間 (service_token の有効期限に合わせる)

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

function key(userId: string): string {
  return `${SESSION_KEY_PREFIX}${userId}`;
}

export async function saveSessionUser(user: SessionUser, ttlSeconds = DEFAULT_TTL): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.set(key(user.id), JSON.stringify(user), "EX", ttlSeconds);
  } catch (err) {
    console.error("[session-cache] saveSessionUser failed:", err);
  }
}

export async function getSessionUser(userId: string): Promise<SessionUser | null> {
  const redis = getRedis();
  if (!redis) return null;
  try {
    const raw = await redis.get(key(userId));
    if (!raw) return null;
    return JSON.parse(raw) as SessionUser;
  } catch (err) {
    console.error("[session-cache] getSessionUser failed:", err);
    return null;
  }
}

export async function invalidateSessionUser(userId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  try {
    await redis.del(key(userId));
  } catch (err) {
    console.error("[session-cache] invalidateSessionUser failed:", err);
  }
}
