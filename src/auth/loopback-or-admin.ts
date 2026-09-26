/**
 * 集計・読み取り専用 API の認可 (spec/feature/task-integration/spec.md §6.4)。
 *
 * ローカルモードの loopback (この PC から直接) か Actio 管理者だけを通す。 チーム所属は要求しない。
 * cf-access 経由 (トンネル越しの閲覧者)・匿名・一般ユーザーは 403。
 * ローカルモードの要求は userContext が LOCAL_USER (role general) を入れるので、 cf-access が admin になることはない。
 */

import { createMiddleware } from "hono/factory";
import { localAccessKind, type LocalAccessKind } from "./local-mode.js";

export function isLoopbackOrAdmin(access: LocalAccessKind | null, userRole: string | undefined): boolean {
  return access === "loopback" || userRole === "admin";
}

export function requireLoopbackOrAdmin() {
  return createMiddleware(async (c, next) => {
    const userRole = c.get("userRole" as never) as string | undefined;
    if (!isLoopbackOrAdmin(localAccessKind(c), userRole)) return c.json({ error: "Forbidden" }, 403);
    await next();
  });
}
