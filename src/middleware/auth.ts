/**
 * 認証ミドルウェア — Cookie または Bearer Token から認証情報を抽出
 *
 * Schedula は自身が発行した service_token を自分の JWT_SECRET で検証する。
 * Cernere は認証プロバイダであり、service_token の検証は行わない。
 * (Cernere と Schedula で JWT_SECRET を共有するのは設計上 NG)
 */

import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import { secretManager } from "../config/secrets.js";
import { getSessionUser, saveSessionUser } from "../auth/session-cache.js";

const TOKEN_COOKIE = "schedula_token";

// ─── 設定 ─────────────────────────────────────────────────────

const jwtSecret = secretManager.get("JWT_SECRET");

// ─── ヘルパー ────────────────────────────────────────────────

function extractToken(c: Parameters<Parameters<typeof createMiddleware>[0]>[0]): string | null {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookieToken = getCookie(c, TOKEN_COOKIE);
  if (cookieToken) return cookieToken;
  return null;
}

function setAnonymous(c: Parameters<Parameters<typeof createMiddleware>[0]>[0]) {
  c.set("userId" as never, "anonymous" as never);
  c.set("userRole" as never, "general" as never);
}

// ─── ミドルウェアエクスポート ──────────────────────────────────

export function userContext() {
  const isDev = secretManager.getOrDefault("NODE_ENV", "") !== "production";

  return createMiddleware(async (c, next) => {
    const token = extractToken(c);

    if (token && jwtSecret) {
      try {
        const payload = jwt.verify(token, jwtSecret) as {
          sub?: string;
          userId?: string;
          role?: string;
          name?: string;
          email?: string;
        };
        const userId = payload.sub ?? payload.userId;
        if (userId) {
          // Redis からセッションユーザーを取得 (キャッシュミスは JWT payload から構築)
          let sessionUser = await getSessionUser(userId);
          if (!sessionUser) {
            sessionUser = {
              id: userId,
              name: payload.name ?? "",
              email: payload.email ?? "",
              role: payload.role ?? "general",
            };
            // JWT 検証は成功したのでキャッシュを復旧
            await saveSessionUser(sessionUser);
          }
          c.set("userId" as never, sessionUser.id as never);
          c.set("userRole" as never, sessionUser.role as never);
          c.set("user" as never, sessionUser as never);
        } else {
          setAnonymous(c);
        }
      } catch {
        setAnonymous(c);
      }
    } else if (isDev && !token) {
      // 開発環境: ヘッダーフォールバック
      const headerUserId = c.req.header("X-User-Id");
      const headerRole = c.req.header("X-User-Role");
      if (headerUserId) {
        c.set("userId" as never, headerUserId as never);
        c.set("userRole" as never, (headerRole ?? "general") as never);
      } else {
        setAnonymous(c);
      }
    } else {
      setAnonymous(c);
    }

    await next();
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
