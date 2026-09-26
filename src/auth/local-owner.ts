/**
 * ローカルモードの持ち主のチーム権限 (spec/feature/local-mode-cf-access.md §4.1)
 *
 * ローカルモードは「この PC の持ち主 1 人」のための配備。持ち主 (`actio-local`) は
 * Cc 同期で `team_refs` にあるチームを membership 無しで leader 相当として使い、
 * メンバー変更も admin 相当として行える。
 *
 * - 判定の根拠は境界 middleware が確定した経路 (loopback / 検証済み cf-access) だけ。
 *   legacy の `users.role` や DB 上の membership は読まない。
 * - 公開配備 (ローカルモード無効) では経路が常に null なので一切適用されない。
 *   `actio-local` を名乗るトークンでも持ち主にはならない。
 */

import type { Context, MiddlewareHandler } from "hono";
import { createMiddleware } from "hono/factory";
import { teamRefRepo } from "../db/repository.js";
import { LOCAL_USER, localAccessKind, localModeEnabled as isLocalDeployment, type LocalAccessKind } from "./local-mode.js";

/** 持ち主が Cc 同期済みチームで持つロール。 */
export const LOCAL_OWNER_TEAM_ROLE = "leader";

/** 持ち主か: ローカルモード有効・経路が確定済み・固定ユーザー本人の 3 条件をすべて満たす。 */
export function isLocalOwner(
  userId: string | null | undefined,
  accessKind: LocalAccessKind | null,
  localModeEnabled: boolean,
): boolean {
  return localModeEnabled && accessKind !== null && userId === LOCAL_USER.id;
}

/** 持ち主のチームロール。`team_refs` に無いチームにはロールを与えない (従来どおり 403)。 */
export function localOwnerTeamRole(teamExists: boolean): typeof LOCAL_OWNER_TEAM_ROLE | undefined {
  return teamExists ? LOCAL_OWNER_TEAM_ROLE : undefined;
}

export function isLocalOwnerRequest(c: Context): boolean {
  const userId = c.get("userId" as never) as string | undefined;
  return isLocalOwner(userId, localAccessKind(c), isLocalDeployment());
}

/** `teamId` に対する持ち主のロール。requireTeamRole が membership の代わりに使う。 */
export async function resolveLocalOwnerTeamRole(teamId: string): Promise<typeof LOCAL_OWNER_TEAM_ROLE | undefined> {
  return localOwnerTeamRole((await teamRefRepo.findById(teamId)) !== undefined);
}

/** 持ち主の要求は通し、それ以外は `fallback` (例: `requireRole("admin")`) の判定に委ねる。 */
export function allowLocalOwnerOr(fallback: MiddlewareHandler): MiddlewareHandler {
  return createMiddleware(async (c, next) => {
    if (isLocalOwnerRequest(c)) {
      await next();
      return;
    }
    return fallback(c, next);
  });
}
