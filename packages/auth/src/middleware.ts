/**
 * 認証ミドルウェア
 *
 * JWT トークンからユーザーコンテキストを抽出し、
 * ロールベースのアクセス制御を提供する。
 */

import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import type { AuthSecretManager, UserRole } from "./types.js";

/**
 * Role-based access control middleware.
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return createMiddleware(async (c, next) => {
    const role = (c.get("userRole" as never) as UserRole) || "general";

    if (!allowedRoles.includes(role)) {
      return c.json(
        {
          error: "Forbidden",
          message: `Role '${role}' is not authorized for this operation`,
          requiredRoles: allowedRoles,
        },
        403,
      );
    }

    await next();
  });
}

/**
 * Extract user context from JWT Bearer token.
 * In development only, falls back to X-User-Id / X-User-Role headers.
 */
export function createUserContext(jwtSecret: string, secretManager: AuthSecretManager) {
  const isProduction = secretManager.getOrDefault("NODE_ENV", "development") === "production";

  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.slice(7);
        const payload = jwt.verify(token, jwtSecret) as {
          userId: string;
          role: string;
        };
        c.set("userId" as never, payload.userId as never);
        c.set("userRole" as never, payload.role as never);
      } catch {
        c.set("userId" as never, "anonymous" as never);
        c.set("userRole" as never, "general" as never);
      }
    } else if (!isProduction) {
      // Legacy header-based auth (development only)
      const userId = c.req.header("X-User-Id") || "anonymous";
      const role = (c.req.header("X-User-Role") as UserRole) || "general";
      c.set("userId" as never, userId as never);
      c.set("userRole" as never, role as never);
    } else {
      // Production: no token = anonymous
      c.set("userId" as never, "anonymous" as never);
      c.set("userRole" as never, "general" as never);
    }

    await next();
  });
}
