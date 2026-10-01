/**
 * PM の変化から通知の意図を作る (純粋関数, PLAN §1.4 / §1.7 / §2, completion.md AT-PM-NOTIFY)。
 *
 * PM プロジェクトはチームを持たないので teamId は null (配送先は Memoria)。担当者は外部サービスの
 * ログイン名のまま本文に書く (Actio のユーザー個人データではない)。
 */

import { EVENT_NAMES } from "../../../src/shared/constants.js";
import type { QueueableNotificationIntent } from "../../task/notifications/events.js";
import type { ExternalChangeType } from "./sync-plan.js";
import type { TrackedTask } from "./tracked-task.js";

export type PmNotificationIntent = QueueableNotificationIntent;

export interface PmTaskRef {
  id: string;
  projectId: string;
  title: string;
}

function projectLink(projectId: string): string {
  return `/pm/${encodeURIComponent(projectId)}`;
}

function intent(
  event: string,
  task: PmTaskRef,
  title: string,
  body: string,
  version: string,
): PmNotificationIntent {
  return {
    event,
    taskId: task.id,
    teamId: null,
    recipientIds: [],
    title,
    body,
    dedupeKey: `${event}:${task.id}:${version}`,
    link: projectLink(task.projectId),
  };
}

export function taskCreatedNotification(task: PmTaskRef, version: string): PmNotificationIntent {
  return intent(EVENT_NAMES.PM_TASK_CREATED, task, `PM タスク追加: ${task.title}`, "外部ソースに新しいタスクが追加されました", version);
}

/** 外部側の変化 1 回分の通知。担当者の変化は別イベントでも送る。 */
export function externalChangeNotifications(
  task: PmTaskRef,
  base: TrackedTask,
  external: TrackedTask,
  changeType: ExternalChangeType,
  changedFieldNames: readonly string[],
  version: string,
): PmNotificationIntent[] {
  const intents: PmNotificationIntent[] = [];
  if (changeType === "closed") {
    intents.push(intent(EVENT_NAMES.PM_TASK_CLOSED, task, `PM タスク完了: ${task.title}`, "外部ソースでクローズされました", version));
  } else if (changeType === "reopened") {
    intents.push(intent(EVENT_NAMES.PM_TASK_REOPENED, task, `PM タスク再オープン: ${task.title}`, "外部ソースで再オープンされました", version));
  } else {
    intents.push(intent(EVENT_NAMES.PM_TASK_UPDATED, task, `PM タスク更新: ${task.title}`, `変更: ${changedFieldNames.join(", ")}`, version));
  }
  const added = external.assignees.filter((a) => !base.assignees.includes(a));
  if (added.length > 0) {
    intents.push(intent(EVENT_NAMES.PM_TASK_ASSIGNED, task, `PM 担当変更: ${task.title}`, `追加: ${added.join(", ")}`, version));
  }
  return intents;
}

export type ConflictNotificationKind = "conflict" | "auto_merged" | "claude_merged" | "force_external";

const CONFLICT_EVENT: Record<ConflictNotificationKind, string> = {
  conflict: EVENT_NAMES.PM_SYNC_CONFLICT,
  auto_merged: EVENT_NAMES.PM_SYNC_AUTO_MERGED,
  claude_merged: EVENT_NAMES.PM_SYNC_CLAUDE_MERGED,
  force_external: EVENT_NAMES.PM_SYNC_FORCE_EXTERNAL,
};

const CONFLICT_TITLE: Record<ConflictNotificationKind, string> = {
  conflict: "PM コンフリクト (解決待ち)",
  auto_merged: "PM 自動マージ",
  claude_merged: "PM LLM マージ",
  force_external: "PM 外部優先で上書き",
};

export function conflictNotification(
  kind: ConflictNotificationKind,
  task: PmTaskRef,
  detail: string,
  version: string,
): PmNotificationIntent {
  return intent(CONFLICT_EVENT[kind], task, `${CONFLICT_TITLE[kind]}: ${task.title}`, detail, version);
}

export function writebackNotification(
  ok: boolean,
  task: PmTaskRef,
  detail: string,
  version: string,
): PmNotificationIntent {
  const event = ok ? EVENT_NAMES.PM_WRITEBACK_SUCCESS : EVENT_NAMES.PM_WRITEBACK_FAILED;
  const title = ok ? `PM 書き戻し成功: ${task.title}` : `PM 書き戻し失敗: ${task.title}`;
  return intent(event, task, title, detail, version);
}

export function deadlineNotification(
  kind: "warning" | "overdue",
  task: PmTaskRef & { dueDate: string },
  today: string,
): PmNotificationIntent {
  const event = kind === "warning" ? EVENT_NAMES.PM_DEADLINE_WARNING : EVENT_NAMES.PM_DEADLINE_OVERDUE;
  const title = kind === "warning" ? `PM 納期が近づいています: ${task.title}` : `PM 納期を過ぎています: ${task.title}`;
  return intent(event, task, title, `納期 ${task.dueDate}`, `${task.dueDate}:${today}`);
}

export function reportReadyNotification(project: { id: string; name: string }, today: string, summary: string): PmNotificationIntent {
  return {
    event: EVENT_NAMES.PM_REPORT_READY,
    taskId: null,
    teamId: null,
    recipientIds: [],
    title: `PM 日次レポート: ${project.name}`,
    body: summary,
    dedupeKey: `${EVENT_NAMES.PM_REPORT_READY}:${project.id}:${today}`,
    link: `${projectLink(project.id)}/analytics`,
  };
}
