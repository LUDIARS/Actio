/**
 * 通知の配送経路と送信本文を決める (純粋関数)。
 * spec/feature/task-integration/spec.md §2.2
 *
 * チームのタスクとスプリントは Cc のチーム面 (task-kanban カード)、 個人タスクは Memoria。
 */

import type { NotificationIntent } from "./events.js";

export const NOTIFICATION_CHANNELS = ["concordia", "memoria"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Cc の既存カード種別。 Cc 側に種別を足さずに済むものを使う。 */
export const CONCORDIA_CARD_KIND = "task-kanban";

export function channelFor(intent: Pick<NotificationIntent, "teamId">): NotificationChannel {
  return intent.teamId ? "concordia" : "memoria";
}

function linkPath(intent: Pick<NotificationIntent, "teamId">): string {
  return intent.teamId ? "/tasks/planning" : "/tasks";
}

/** frontendUrl が空なら相対パスのリンクにする (Memoria は相対パスを受ける)。 */
export function buildDeliveryPayload(
  intent: NotificationIntent,
  channel: NotificationChannel,
  frontendUrl: string,
): Record<string, unknown> {
  const base = frontendUrl.replace(/\/+$/, "");
  const link = `${base}${linkPath(intent)}`;
  if (channel === "concordia") {
    return { kind: CONCORDIA_CARD_KIND, title: intent.title, body: `${link}\n\n${intent.body}` };
  }
  return {
    title: intent.title,
    body: intent.body,
    url: link,
    source: "actio",
    event: intent.event,
    ...(intent.taskId ? { task_id: intent.taskId } : {}),
  };
}
