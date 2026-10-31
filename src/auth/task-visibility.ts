/**
 * タスクの閲覧範囲 (spec/feature/task-visibility.md)
 *
 * 通常モード (Cernere ログイン) で複数組織が同じ DB を使うとき、 だれがどのタスクを見られるかを決める。
 *
 * - 全件を見られるのは Actio 管理者 (`userRole=admin`) と、 ローカルモードの持ち主だけ。
 * - それ以外は「自分が作った」「自分が担当」「自分が member のチームのタスク」に限る。
 * - チーム所属の正本は `team_members`。 判定のたびに引き、 キャッシュしない (外したメンバーを即座に締め出す)。
 *
 * 純粋な判定 (`canViewTask` / `isUnrestricted`) と、 DB を引く解決 (`resolveTaskViewer`) を分ける。
 */

import type { Context } from "hono";
import { teamMemberRepo } from "../db/repository.js";
import { getUserRole } from "../middleware/getUserId.js";
import { isLocalOwnerRequest } from "./local-owner.js";

/** 閲覧者。 `unrestricted` は全件、 `scoped` は自分・担当・所属チームに限る。 */
export type TaskViewer =
  | { kind: "unrestricted"; userId: string }
  | { kind: "scoped"; userId: string; teamIds: readonly string[] };

/** 閲覧判定に使うタスクの項目。 */
export interface VisibleTaskFields {
  ownerId: string;
  assigneeId: string | null;
  teamId: string | null;
}

export function isUnrestricted(role: string, localOwner: boolean): boolean {
  return role === "admin" || localOwner;
}

export function canViewTask(viewer: TaskViewer, task: VisibleTaskFields): boolean {
  if (viewer.kind === "unrestricted") return true;
  if (task.ownerId === viewer.userId || task.assigneeId === viewer.userId) return true;
  return task.teamId !== null && viewer.teamIds.includes(task.teamId);
}

/** 認証済み `userId` の閲覧者を決める。 匿名の締め出しは呼び出し側が先に行う。 */
export async function resolveTaskViewer(c: Context, userId: string): Promise<TaskViewer> {
  if (isUnrestricted(getUserRole(c), isLocalOwnerRequest(c))) return { kind: "unrestricted", userId };
  const memberships = await teamMemberRepo.listByUser(userId);
  return { kind: "scoped", userId, teamIds: memberships.map((m) => m.teamId) };
}
