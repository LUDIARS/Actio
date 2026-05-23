/**
 * 認証ミドルウェア — Cookie または Bearer Token から認証情報を抽出
 *
 * 2 経路を順に試す:
 *   1. PASETO V4 (`v4.public.*`): Cernere が発行した user_for_project token。
 *      Hub (Corpus) 経由の data fetch で来る。 audience = ACTIO_PUBLIC_URL を強制
 *   2. HS256 jsonwebtoken: Actio 自身が発行した service_token (Composite 経由
 *      ログインフロー) — JWT_SECRET で自前検証 (Cernere とは別の secret)
 *
 * どちらも失敗時は anonymous (Actio の慣習: 401 を返さず requireRole で都度判定)。
 */

import { createMiddleware } from "hono/factory";
import { getCookie } from "hono/cookie";
import jwt from "jsonwebtoken";
import { secretManager } from "../config/secrets.js";
import { getSessionUser, saveSessionUser } from "../auth/session-cache.js";
import { verifyPasetoToken } from "../auth/paseto-verify.js";

const TOKEN_COOKIE = "actio_token";

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

    if (token) {
      // ─── 1) PASETO V4 (Cernere user_for_project token, Hub 経由) ───
      const pasetoId = await verifyPasetoToken(token);
      if (pasetoId) {
        let sessionUser = await getSessionUser(pasetoId.userId);
        if (!sessionUser) {
          sessionUser = {
            id: pasetoId.userId,
            name: pasetoId.displayName ?? "",
            email: "",
            role: pasetoId.role,
          };
          await saveSessionUser(sessionUser);
        }
        c.set("userId" as never, sessionUser.id as never);
        c.set("userRole" as never, sessionUser.role as never);
        c.set("user" as never, sessionUser as never);
        await next();
        return;
      }

      // ─── 2) HS256 service_token (Actio 自身が発行) ───
      if (jwtSecret) {
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
            let sessionUser = await getSessionUser(userId);
            if (!sessionUser) {
              sessionUser = {
                id: userId,
                name: payload.name ?? "",
                email: payload.email ?? "",
                role: payload.role ?? "general",
              };
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
      } else {
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
