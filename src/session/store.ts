/**
 * セッションストア — Redis優先、DBフォールバック
 *
 * Redis が利用可能なら高速なインメモリストアを使用し、
 * AOFで永続化する。Redis が使えない場合は既存のDBセッションテーブルを使用。
 */

import { v4 as uuidv4 } from "uuid";
import { getRedis } from "../db/redis.js";
import { sessionRepo } from "../db/repository.js";

const SESSION_PREFIX = "session:";
const REFRESH_INDEX_PREFIX = "refresh:";

export interface SessionData {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: Date;
  createdAt: Date;
}

/** セッション有効期限（秒） */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60; // 30日

/**
 * 新しいセッションを作成
 */
export async function createSession(
  userId: string,
  refreshToken: string,
  expiresAt: Date,
): Promise<SessionData> {
  const sessionId = uuidv4();
  const now = new Date();
  const session: SessionData = {
    id: sessionId,
    userId,
    refreshToken,
    expiresAt,
    createdAt: now,
  };

  const redis = getRedis();
  if (redis) {
    try {
      const data = JSON.stringify({
        id: sessionId,
        userId,
        refreshToken,
        expiresAt: expiresAt.toISOString(),
        createdAt: now.toISOString(),
      });
      await redis
        .multi()
        .set(`${SESSION_PREFIX}${sessionId}`, data, "EX", SESSION_TTL_SECONDS)
        .set(`${REFRESH_INDEX_PREFIX}${refreshToken}`, sessionId, "EX", SESSION_TTL_SECONDS)
        .exec();
      console.log(`[session:redis] セッション作成 sessionId: ${sessionId}`);
    } catch (err) {
      console.error("[session:redis] 作成失敗、DBフォールバック:", err);
      await sessionRepo.create({ id: sessionId, userId, refreshToken, expiresAt, createdAt: now });
    }
  } else {
    await sessionRepo.create({ id: sessionId, userId, refreshToken, expiresAt, createdAt: now });
  }

  return session;
}

/**
 * リフレッシュトークンでセッションを検索
 */
export async function findByRefreshToken(refreshToken: string): Promise<SessionData | null> {
  const redis = getRedis();
  if (redis) {
    try {
      const sessionId = await redis.get(`${REFRESH_INDEX_PREFIX}${refreshToken}`);
      if (!sessionId) return null;

      const data = await redis.get(`${SESSION_PREFIX}${sessionId}`);
      if (!data) return null;

      const parsed = JSON.parse(data);
      return {
        ...parsed,
        expiresAt: new Date(parsed.expiresAt),
        createdAt: new Date(parsed.createdAt),
      };
    } catch (err) {
      console.error("[session:redis] 検索失敗、DBフォールバック:", err);
    }
  }

  // DBフォールバック
  const dbSession = await sessionRepo.findByRefreshToken(refreshToken);
  if (!dbSession) return null;
  return {
    id: dbSession.id,
    userId: dbSession.userId,
    refreshToken: dbSession.refreshToken,
    expiresAt: new Date(dbSession.expiresAt),
    createdAt: new Date(dbSession.createdAt),
  };
}

/**
 * リフレッシュトークンをローテーション（更新）
 */
export async function rotateRefreshToken(
  sessionId: string,
  oldRefreshToken: string,
  newRefreshToken: string,
  expiresAt: Date,
): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      // 既存セッションデータを取得
      const data = await redis.get(`${SESSION_PREFIX}${sessionId}`);
      if (data) {
        const parsed = JSON.parse(data);
        parsed.refreshToken = newRefreshToken;
        parsed.expiresAt = expiresAt.toISOString();

        await redis
          .multi()
          .set(`${SESSION_PREFIX}${sessionId}`, JSON.stringify(parsed), "EX", SESSION_TTL_SECONDS)
          .del(`${REFRESH_INDEX_PREFIX}${oldRefreshToken}`)
          .set(`${REFRESH_INDEX_PREFIX}${newRefreshToken}`, sessionId, "EX", SESSION_TTL_SECONDS)
          .exec();
        console.log(`[session:redis] トークンローテーション sessionId: ${sessionId}`);
        return;
      }
    } catch (err) {
      console.error("[session:redis] ローテーション失敗、DBフォールバック:", err);
    }
  }

  // DBフォールバック
  await sessionRepo.updateRefreshToken(sessionId, newRefreshToken);
}

/**
 * セッションを削除（ログアウト）
 */
export async function deleteByRefreshToken(refreshToken: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const sessionId = await redis.get(`${REFRESH_INDEX_PREFIX}${refreshToken}`);
      if (sessionId) {
        await redis
          .multi()
          .del(`${SESSION_PREFIX}${sessionId}`)
          .del(`${REFRESH_INDEX_PREFIX}${refreshToken}`)
          .exec();
        console.log(`[session:redis] セッション削除 sessionId: ${sessionId}`);
        return;
      }
    } catch (err) {
      console.error("[session:redis] 削除失敗、DBフォールバック:", err);
    }
  }

  // DBフォールバック
  await sessionRepo.deleteByRefreshToken(refreshToken);
}

/**
 * セッションIDで削除
 */
export async function deleteById(sessionId: string): Promise<void> {
  const redis = getRedis();
  if (redis) {
    try {
      const data = await redis.get(`${SESSION_PREFIX}${sessionId}`);
      if (data) {
        const parsed = JSON.parse(data);
        await redis
          .multi()
          .del(`${SESSION_PREFIX}${sessionId}`)
          .del(`${REFRESH_INDEX_PREFIX}${parsed.refreshToken}`)
          .exec();
        console.log(`[session:redis] セッション削除(ID) sessionId: ${sessionId}`);
        return;
      }
    } catch (err) {
      console.error("[session:redis] 削除(ID)失敗、DBフォールバック:", err);
    }
  }

  // DBフォールバック
  await sessionRepo.deleteById(sessionId);
}
