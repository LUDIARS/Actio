/**
 * 個人タスク (Memoria 移植) 用ヘルパー。
 *
 * - Memoria 互換の入力 (status todo/doing/done, details, due_at) を Actio の
 *   コアタスクモデルへ正規化する。
 * - 認証未配線フェーズ向けの userId 解決 (無認証なら default personal user)。
 *
 * 認証を後で被せる際は resolveUserId のフォールバックを外すだけで済む。
 */

import type { Context } from "hono";
import { getUserId } from "../../src/middleware/getUserId.js";
import type { TaskStatus } from "../../src/shared/types.js";

/**
 * 認証未配線フェーズの既定オーナー。 Memoria は単一ユーザ運用なので
 * ログインしていなければこの id を owner として個人タスクを扱う。
 * tasks.owner_id に FK 制約は無いため users への seed は不要。
 */
export const PERSONAL_USER_ID = process.env.ACTIO_PERSONAL_USER_ID || "local";

/** 認証があればその userId、 無ければ既定の個人ユーザを返す */
export function resolveUserId(c: Context): string {
  return getUserId(c) ?? PERSONAL_USER_ID;
}

const VALID_STATUSES: TaskStatus[] = [
  "open",
  "in_progress",
  "blocked",
  "done",
  "cancelled",
];

// Memoria の 3 値 → Actio コア enum
const STATUS_ALIASES: Record<string, TaskStatus> = {
  todo: "open",
  doing: "in_progress",
  done: "done",
};

/**
 * status 入力を Actio enum へ正規化。 todo/doing/done エイリアスも受理。
 * 不正値は undefined を返す (呼び出し側で 400 判定)。
 */
export function normalizeStatus(input: unknown): TaskStatus | undefined {
  if (typeof input !== "string") return undefined;
  const mapped = STATUS_ALIASES[input] ?? input;
  return (VALID_STATUSES as string[]).includes(mapped)
    ? (mapped as TaskStatus)
    : undefined;
}

/** kind の正規化 (task/goal 以外は task 扱い) */
export function normalizeKind(input: unknown): "task" | "goal" {
  return input === "goal" ? "goal" : "task";
}

/** creator_type の正規化 (ai 以外は human 扱い) */
export function normalizeCreatorType(input: unknown): "human" | "ai" {
  return input === "ai" ? "ai" : "human";
}

// ─── Memoria 互換シム (ハブ移行期) ───────────────────────────
// Memoria / 既存 skill 群は {items} 形・status todo/doing/done・due_at/details
// を期待する。 ?format=memoria でこの形に変換して返し、 consumer の改修を
// base URL 差し替え中心に留める。 ハブサービス完成後に撤去予定。

// Actio enum → Memoria 3 値 (blocked→doing, cancelled→done に寄せる)
const STATUS_TO_MEMORIA: Record<string, "todo" | "doing" | "done"> = {
  open: "todo",
  in_progress: "doing",
  blocked: "doing",
  done: "done",
  cancelled: "done",
};

export function statusToMemoria(status: string): "todo" | "doing" | "done" {
  return STATUS_TO_MEMORIA[status] ?? "todo";
}

/** Actio タスク行を Memoria 互換 shape に変換 */
export interface MemoriaTaskShape {
  id: string;
  title: string;
  details: string | null;
  status: "todo" | "doing" | "done";
  kind: string;
  creator_type: string;
  due_at: string | null;
  category: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export function toMemoriaShape(task: {
  id: string;
  title: string;
  description: string | null;
  status: string;
  kind: string;
  creatorType: string;
  category: string | null;
  deadline: Date | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}): MemoriaTaskShape {
  return {
    id: task.id,
    title: task.title,
    details: task.description,
    status: statusToMemoria(task.status),
    kind: task.kind,
    creator_type: task.creatorType,
    due_at: task.deadline ? task.deadline.toISOString() : null,
    category: task.category,
    created_at: task.createdAt ? task.createdAt.toISOString() : null,
    updated_at: task.updatedAt ? task.updatedAt.toISOString() : null,
  };
}
