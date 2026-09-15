/**
 * 通知の意図を送信箱 (task_notifications) に積む (task-integration §2.3)。
 * 同じ dedupe_key は 1 回だけ積む。 配送は dispatcher が別に行う。
 */

import { v4 as uuidv4 } from "uuid";
import { secretManager } from "../../../src/config/secrets.js";
import { taskNotificationRepo, type NewTaskNotification } from "../../../src/db/repository.js";
import type { NotificationIntent } from "./events.js";
import { buildDeliveryPayload, channelFor } from "./route.js";

export interface EnqueueDeps {
  insertIfAbsent: (row: NewTaskNotification) => Promise<boolean>;
  frontendUrl: () => string;
  now: () => Date;
  newId: () => string;
}

const defaultDeps: EnqueueDeps = {
  insertIfAbsent: (row) => taskNotificationRepo.insertIfAbsent(row),
  frontendUrl: () => secretManager.getOrDefault("FRONTEND_URL", ""),
  now: () => new Date(),
  newId: () => uuidv4(),
};

/** 積んだ件数を返す (重複で積まなかった分は数えない)。 */
export async function enqueueNotifications(intents: readonly NotificationIntent[], deps: EnqueueDeps = defaultDeps): Promise<number> {
  let queued = 0;
  for (const intent of intents) {
    const channel = channelFor(intent);
    const inserted = await deps.insertIfAbsent({
      id: deps.newId(),
      taskId: intent.taskId,
      teamId: intent.teamId,
      event: intent.event,
      channel,
      dedupeKey: intent.dedupeKey,
      payload: buildDeliveryPayload(intent, channel, deps.frontendUrl()),
      status: "pending",
      attempts: 0,
      lastError: null,
      createdAt: deps.now(),
      sentAt: null,
    });
    if (inserted) queued += 1;
  }
  return queued;
}

/**
 * タスク更新の API 応答を通知の失敗で落とさないための入口。 通知は付随処理なので、
 * 積めなかったときは警告を残して続行する (タスク自体の変更は成立している)。
 */
export async function enqueueNotificationsSafely(intents: readonly NotificationIntent[]): Promise<void> {
  if (intents.length === 0) return;
  try {
    await enqueueNotifications(intents);
  } catch (error) {
    console.warn(`[task-notify] 通知を送信箱に積めませんでした: ${error instanceof Error ? error.message : String(error)}`);
  }
}
