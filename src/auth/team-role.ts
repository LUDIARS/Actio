/**
 * チームロール認可 middleware (spec/feature/team-task/spec.md §3)
 *
 * - ロールは `team_members.role` (Actio 正本)。leader は member 権限を包含する。
 * - `userRole=admin` (Cernere 検証済みトークン由来) は明示バイパス。
 *   legacy の `users.role` カラムは読まない (userContext() がトークンから設定する)。
 * - Cc service 経路 (api_client トークン, `apiClientId` がコンテキストにある) では
 *   判断者 `X-Decided-By` (Actio user id) を必須にし、対象チームのメンバーへ
 *   マッピングできない場合は 403 (「匿名の裁定を残さない」)。
 * - 裁定 scope は T2 では定義のみ (`TEAM_ADJUDICATION_SCOPE`)。PATCH review-items
 *   (T4) がこの scope を要求する。
 */

import { createMiddleware } from "hono/factory";
import { teamMemberRepo } from "../db/repository.js";

export type TeamRole = "leader" | "member";

/** 裁定 (review-items 判定) 用の外部 API scope。T4 の requireApiKey で使う。 */
export const TEAM_ADJUDICATION_SCOPE = "team-adjudication";

/** leader は member を包含する */
function roleSatisfies(actual: string, required: TeamRole[]): boolean {
  if (required.includes(actual as TeamRole)) return true;
  return actual === "leader" && required.includes("member");
}

/**
 * `:teamId` パラメータのチームに対し、指定ロール (以上) を要求する。
 * 通過時はコンテキストに `teamRole` / `actingUserId` を設定する。
 */
export function requireTeamRole(...required: TeamRole[]) {
  return createMiddleware(async (c, next) => {
    const teamId = c.req.param("teamId");
    if (!teamId) return c.json({ error: "teamId is required" }, 400);

    const apiClientId = c.get("apiClientId" as never) as string | undefined;
    if (apiClientId) {
      // Cc service 経路: 判断者の Actio user id を必須にする
      const decidedBy = c.req.header("X-Decided-By");
      if (!decidedBy) {
        return c.json({ error: "X-Decided-By (Actio user id) is required for service requests" }, 403);
      }
      const role = await teamMemberRepo.findRole(teamId, decidedBy);
      if (role === undefined || !roleSatisfies(role, required)) {
        return c.json({ error: "decided_by user does not hold the required team role" }, 403);
      }
      c.set("teamRole" as never, role as never);
      c.set("actingUserId" as never, decidedBy as never);
      await next();
      return;
    }

    const userId = c.get("userId" as never) as string | undefined;
    const userRole = c.get("userRole" as never) as string | undefined;
    if (!userId || userId === "anonymous") return c.json({ error: "Forbidden" }, 403);

    if (userRole === "admin") {
      // Actio 管理者は §3 の表どおり全チーム操作をバイパスできる
      c.set("teamRole" as never, "admin" as never);
      c.set("actingUserId" as never, userId as never);
      await next();
      return;
    }

    const role = await teamMemberRepo.findRole(teamId, userId);
    if (role === undefined || !roleSatisfies(role, required)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    c.set("teamRole" as never, role as never);
    c.set("actingUserId" as never, userId as never);
    await next();
  });
}
