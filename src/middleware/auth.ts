import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import type { UserRole } from "../shared/constants.js";

const JWT_SECRET = process.env.JWT_SECRET || "schedula-dev-secret-change-in-production";

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
        403
      );
    }

    await next();
  });
}

/**
 * Extract user context from JWT Bearer token or legacy headers.
 * Supports both:
 *  - Authorization: Bearer <jwt> (production)
 *  - X-User-Id / X-User-Role headers (development fallback)
 */
export function userContext() {
  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header("Authorization");
    const method = c.req.method;
    const path = c.req.path;

    console.log(`[middleware:userContext] ${method} ${path}`);

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.slice(7);
        const payload = jwt.verify(token, JWT_SECRET) as {
          userId: string;
          role: string;
        };
        c.set("userId" as never, payload.userId as never);
        c.set("userRole" as never, payload.role as never);
        console.log(`[middleware:userContext] JWT認証成功 userId: ${payload.userId}, role: ${payload.role}`);
      } catch (err) {
        // Invalid token - fall through to header-based auth
        c.set("userId" as never, "anonymous" as never);
        c.set("userRole" as never, "general" as never);
        console.warn(`[middleware:userContext] JWT検証失敗:`, err instanceof Error ? err.message : err);
      }
    } else {
      // Legacy header-based auth (development)
      const userId = c.req.header("X-User-Id") || "anonymous";
      const role = (c.req.header("X-User-Role") as UserRole) || "general";
      c.set("userId" as never, userId as never);
      c.set("userRole" as never, role as never);
      console.log(`[middleware:userContext] ヘッダー認証 userId: ${userId}, role: ${role}`);
    }

    await next();
  });
}
