import { createMiddleware } from "hono/factory";
import jwt from "jsonwebtoken";
import type { UserRole } from "../shared/constants.js";
import { JWT_SECRET } from "../config/jwt.js";
import { secretManager } from "../config/secrets.js";

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

const IS_PRODUCTION = secretManager.getOrDefault("NODE_ENV", "development") === "production";

/**
 * Extract user context from JWT Bearer token.
 * In development only, falls back to X-User-Id / X-User-Role headers.
 */
export function userContext() {
  return createMiddleware(async (c, next) => {
    const authHeader = c.req.header("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
      try {
        const token = authHeader.slice(7);
        const payload = jwt.verify(token, JWT_SECRET) as {
          userId: string;
          role: string;
        };
        c.set("userId" as never, payload.userId as never);
        c.set("userRole" as never, payload.role as never);
      } catch {
        c.set("userId" as never, "anonymous" as never);
        c.set("userRole" as never, "general" as never);
      }
    } else if (!IS_PRODUCTION) {
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
