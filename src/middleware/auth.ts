import { createMiddleware } from "hono/factory";
import type { UserRole } from "../shared/constants.js";

/**
 * Role-based access control middleware.
 *
 * Authorization matrix (from design doc §7.3):
 * - admin: full access to all modules
 * - teacher: M1 read, M2/M3/M4 own data, M5 own settings
 * - student: M2/M3/M4 own data, M5 own settings
 * - guest: M4 public read only
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return createMiddleware(async (c, next) => {
    const role = (c.req.header("X-User-Role") as UserRole) || "guest";

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
 * Extract user context from headers.
 * In production, this would validate JWT / OAuth tokens.
 */
export function userContext() {
  return createMiddleware(async (c, next) => {
    const userId = c.req.header("X-User-Id") || "anonymous";
    const role = (c.req.header("X-User-Role") as UserRole) || "guest";

    c.set("userId" as never, userId as never);
    c.set("userRole" as never, role as never);

    await next();
  });
}
