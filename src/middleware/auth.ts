/**
 * 認証ミドルウェア — @cernere/id-cache に委譲
 *
 * Cernere コアサーバーに認証を委譲し、
 * キャッシュ付き JWT 検証でユーザー情報を解決する。
 *
 * Cernere が到達不可能な場合（テスト環境等）は
 * ローカル JWT 検証にフォールバックする。
 */

import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import { createIdCache, createIdCacheMiddleware } from "@ludiars/cernere-id-cache";
import { secretManager } from "../config/secrets.js";

// ─── 設定 ─────────────────────────────────────────────────────

const cernereUrl = secretManager.getOrDefault("CERNERE_URL", "http://localhost:8080");
const jwtSecret = secretManager.get("JWT_SECRET");

// Cernere URL が設定されている場合のみキャッシュクライアントを作成
const hasCernere = !!secretManager.get("CERNERE_URL");

const idCache = hasCernere
  ? createIdCache({
      idServiceUrl: cernereUrl,
      jwtSecret,
      cacheTtlSeconds: 300,
    })
  : null;

// ─── ミドルウェアエクスポート ──────────────────────────────────

export function userContext() {
  const isDev = secretManager.getOrDefault("NODE_ENV", "") !== "production";
  return createIdCacheMiddleware({
    idCache,
    jwtSecret,
    isDev,
  });
}

/**
 * ロールベース認可ミドルウェア
 */
export function requireRole(...allowedRoles: string[]) {
  return createMiddleware(async (c, next) => {
    const role = c.get("userRole" as never) as string | undefined;
    if (!role || !allowedRoles.includes(role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  });
}
