/**
 * Task 状態変化の即時 push 通知
 *
 * Task の status / assignee / priority が変わったときに対応する関係者に
 * Nuntius `/api/notify/user` で即時送信する。 配信 channel (webpush 含む)
 * はユーザの notification_preferences で決まる。
 *
 * 設計判断 (session log 2026-05-01-3 残課題で合意):
 *   A. 完了通知 — owner に push。 自完了 (owner === completedBy) も デフォルト ON
 *      (user_preferences `notify.task.self_completion=false` で OFF)
 *   B. アサイン通知 — new assignee に push。 自アサイン (assignedBy === assignee) は skip
 *   C. 優先度上昇通知 — priority が `high` になった時のみ assignee (fallback owner) に push
 *      `critical` への変更は別運用 (緊急時の手動連絡を想定) のため push 対象外
 *
 * source 命名:
 *   `actio.task.<id>.completed`
 *   `actio.task.<id>.assigned.<assigneeId>`
 *   `actio.task.<id>.priority.<newPriority>`
 */

import { postNotify } from "./nuntius-notify.js";
import { getUserInfo } from "../auth/user-info.js";
import { userPreferenceRepo } from "../db/repository.js";
import type { TaskPriority, TaskStatus } from "../shared/types.js";

const TITLE_CAP = 60;

function clipTitle(s: string): string {
  if (s.length <= TITLE_CAP) return s;
  return s.slice(0, TITLE_CAP - 1) + "…";
}

function frontendTaskUrl(taskId: string): string {
  return `/tasks?task=${encodeURIComponent(taskId)}`;
}

/** 完了通知 (status: !done → done) を owner に送信。 */
export interface NotifyTaskCompletedInput {
  taskId: string;
  taskTitle: string;
  ownerId: string;
  assigneeId: string | null;
  /** status を done に変えた user (PUT 実行者) */
  completedById: string;
}

export async function notifyTaskCompleted(input: NotifyTaskCompletedInput): Promise<void> {
  const recipientId = input.ownerId;

  // 自分が完了させた自タスクは preferences で gate
  if (input.completedById === recipientId) {
    const pref = await userPreferenceRepo
      .get(recipientId, "notify.task.self_completion")
      .catch(() => undefined);
    // 未設定 = デフォルト ON、 明示的に "false" のときのみ skip
    if (pref === "false") return;
  }

  // 完了者の名前 (assignee != owner のときに「誰が」 を入れる)
  let actorName = "";
  if (input.completedById !== recipientId) {
    const info = await getUserInfo(input.completedById).catch(() => null);
    actorName = info?.name ?? "";
  }

  const title = `✅ タスク完了: ${clipTitle(input.taskTitle)}`;
  const body = actorName
    ? `${actorName} が完了しました`
    : `お疲れ様でした`;

  await postNotify({
    userId: recipientId,
    title,
    body,
    url: frontendTaskUrl(input.taskId),
    source: `actio.task.${input.taskId}.completed`,
    idempotencyKey: `actio.task.${input.taskId}.completed`,
  });
}

/** アサイン通知を new assignee に送信。 */
export interface NotifyTaskAssignedInput {
  taskId: string;
  taskTitle: string;
  newAssigneeId: string;
  ownerId: string;
  /** assignment を起こした user (POST 作成者 or PUT 実行者) */
  assignedById: string;
}

export async function notifyTaskAssigned(input: NotifyTaskAssignedInput): Promise<void> {
  // 自アサインは skip (操作した本人なので通知不要)
  if (input.assignedById === input.newAssigneeId) return;

  const ownerInfo = await getUserInfo(input.ownerId).catch(() => null);
  const ownerName = ownerInfo?.name ?? "";

  const title = `📋 アサイン: ${clipTitle(input.taskTitle)}`;
  const body = ownerName
    ? `${ownerName} があなたにタスクをアサインしました`
    : `あなたにタスクがアサインされました`;

  await postNotify({
    userId: input.newAssigneeId,
    title,
    body,
    url: frontendTaskUrl(input.taskId),
    source: `actio.task.${input.taskId}.assigned.${input.newAssigneeId}`,
    idempotencyKey: `actio.task.${input.taskId}.assigned.${input.newAssigneeId}`,
  });
}

/** 優先度上昇通知 (high になったときのみ) を assignee or owner に送信。 */
export interface NotifyTaskPriorityRaisedInput {
  taskId: string;
  taskTitle: string;
  ownerId: string;
  assigneeId: string | null;
  oldPriority: TaskPriority;
  newPriority: TaskPriority;
  raisedById: string;
}

export async function notifyTaskPriorityRaised(input: NotifyTaskPriorityRaisedInput): Promise<void> {
  // 仕様: high のみ通知 (critical は緊急の手動連絡フロー、 low/medium は静か)
  if (input.newPriority !== "high") return;
  // 上昇でない (high → high など) は skip
  if (input.oldPriority === "high" || input.oldPriority === "critical") return;

  const recipientId = input.assigneeId ?? input.ownerId;

  // 自分で上げた場合は通知不要
  if (input.raisedById === recipientId) return;

  const actorInfo = await getUserInfo(input.raisedById).catch(() => null);
  const actorName = actorInfo?.name ?? "";

  const title = `⚠️ 優先度上昇: ${clipTitle(input.taskTitle)}`;
  const body = actorName
    ? `${actorName} が ${input.oldPriority} → ${input.newPriority} に変更しました`
    : `優先度が ${input.oldPriority} → ${input.newPriority} に変わりました`;

  await postNotify({
    userId: recipientId,
    title,
    body,
    url: frontendTaskUrl(input.taskId),
    source: `actio.task.${input.taskId}.priority.${input.newPriority}`,
    idempotencyKey: `actio.task.${input.taskId}.priority.${input.newPriority}`,
  });
}

// type re-export 用 (route 側で使う)
export type { TaskStatus };
