/**
 * Permissions middleware — Issue #111 D7
 *
 * プラグインから使える role 判定 Hono middleware 群. 以前は `context.ts`
 * の stub が throw するだけだったので、プラグイン側は「何で role を
 * 検証すべきか」を毎回手探りしていた. このモジュールで統一する.
 *
 * 使い方 (プラグイン内):
 *
 * ```ts
 * app.use("/admin/*",       ctx.permissions.requireSystemAdmin());
 * app.use("/groups/:groupId/manage", ctx.permissions.requireGroupRole("leader"));
 * ```
 */

import type { Context, MiddlewareHandler } from "hono";

import { verifyRoleViaCernere } from "../auth/user-info.js";
import { groupMemberRepo } from "../db/repository.js";

function currentUserId(c: Context): string | null {
  const id = c.get("userId" as never) as string | undefined;
  if (!id || id === "anonymous") return null;
  return id;
}

function jwtRole(c: Context): string {
  return (c.get("userRole" as never) as string) || "general";
}

/** `admin` role の検証 (S2 の fail-closed ルールを共有). */
export function requireSystemAdminMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const userId = currentUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);

    const isProd = (process.env.NODE_ENV ?? "development") === "production";
    const verdict = await verifyRoleViaCernere(userId);

    if (verdict.source === "cernere") {
      if (verdict.role !== "admin") return c.json({ error: "Admin role required" }, 403);
      return next();
    }
    if (isProd) {
      console.warn(`[permissions] Cernere unreachable (fail-closed) for ${userId}`);
      return c.json({ error: "Admin verification unavailable" }, 403);
    }
    if (jwtRole(c) !== "admin") return c.json({ error: "Admin role required" }, 403);
    return next();
  };
}

/** Group role middleware.
 *  - `:groupId` route param もしくは `X-Group-Id` header から group 特定.
 *  - 階層: owner > leader > member.
 */
export function requireGroupRoleMiddleware(
  role: "owner" | "leader" | "member",
): MiddlewareHandler {
  return async (c, next) => {
    const userId = currentUserId(c);
    if (!userId) return c.json({ error: "Authentication required" }, 401);
    const groupId = c.req.param("groupId") ?? c.req.header("x-group-id");
    if (!groupId) return c.json({ error: "Group ID is required (:groupId param or X-Group-Id header)" }, 400);

    const member = await groupMemberRepo.findByGroupAndUser(groupId, userId);
    if (!member) return c.json({ error: "Not a member of this group" }, 403);

    const rank = (r: string): number => {
      switch (r) {
        case "owner":  return 3;
        case "leader": return 2;
        case "member": return 1;
      }
      return 0;
    };
    if (rank(member.role) < rank(role)) {
      return c.json({ error: `Group ${role} role required` }, 403);
    }
    return next();
  };
}
