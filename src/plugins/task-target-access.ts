/**
 * 拡張データ (コメント / リンク / カスタム項目) の対象タスクへの閲覧権 (spec/feature/task-visibility.md §4)
 *
 * 対象が task なら、そのタスクを見られる人だけが拡張データを読み書きできる。
 * event は Schedula 分離の対象で Actio 側に閲覧範囲の正本が無いため、従来どおり判定しない。
 */

import type { Context } from "hono";
import { taskRepo } from "../db/repository.js";
import { canViewTask, resolveTaskViewer } from "../auth/task-visibility.js";
import type { TargetType } from "./extensions-repo.js";

export type TargetAccess = "ok" | "not_found" | "forbidden";

export async function checkTargetAccess(c: Context, userId: string, type: TargetType, id: string): Promise<TargetAccess> {
  if (type !== "task") return "ok";
  const task = await taskRepo.findById(id);
  if (!task) return "not_found";
  return canViewTask(await resolveTaskViewer(c, userId), task) ? "ok" : "forbidden";
}

/** 複数の対象をまとめて確認し、最初に拒否された結果を返す。 */
export async function checkTargetsAccess(
  c: Context,
  userId: string,
  targets: ReadonlyArray<{ type: TargetType; id: string }>,
): Promise<TargetAccess> {
  for (const target of targets) {
    const result = await checkTargetAccess(c, userId, target.type, target.id);
    if (result !== "ok") return result;
  }
  return "ok";
}

export function targetAccessResponse(c: Context, access: Exclude<TargetAccess, "ok">): Response {
  return access === "not_found" ? c.json({ error: "target not found" }, 404) : c.json({ error: "Forbidden" }, 403);
}
