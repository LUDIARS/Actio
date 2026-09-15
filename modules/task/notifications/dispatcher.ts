/**
 * 送信箱の pending を Cc / Memoria へ配送する (task-integration §2.3)。
 * 設定欠落は再試行しても直らないので即 failed、 それ以外は MAX_ATTEMPTS 回まで再試行する。
 */

import type { TaskNotification } from "../../../src/db/repository.js";
import type { NotificationChannel } from "./route.js";
import { NotificationConfigError, type NotificationSink } from "./sink.js";

export const MAX_NOTIFICATION_ATTEMPTS = 5;
const DISPATCH_BATCH = 50;
const ERROR_MAX = 500;

export interface DispatchDeps {
  listPending: (limit: number) => Promise<TaskNotification[]>;
  markSent: (id: string, at: Date) => Promise<void>;
  markFailed: (id: string, error: string) => Promise<void>;
  markAttemptFailed: (id: string, error: string, maxAttempts: number) => Promise<void>;
  sinks: Record<NotificationChannel, NotificationSink>;
  now: () => Date;
}

export interface DispatchResult {
  sent: number;
  failed: number;
  retrying: number;
}

function isChannel(value: string, sinks: DispatchDeps["sinks"]): value is NotificationChannel {
  return Object.prototype.hasOwnProperty.call(sinks, value);
}

export async function dispatchPendingNotifications(deps: DispatchDeps): Promise<DispatchResult> {
  const result: DispatchResult = { sent: 0, failed: 0, retrying: 0 };
  for (const row of await deps.listPending(DISPATCH_BATCH)) {
    // The row type comes from the dialect-selected schema (untyped), so narrow through a string first.
    const channel: string = row.channel;
    if (!isChannel(channel, deps.sinks)) {
      await deps.markFailed(row.id, `unknown channel: ${channel}`.slice(0, ERROR_MAX));
      result.failed += 1;
      continue;
    }
    try {
      await deps.sinks[channel].deliver({ teamId: row.teamId }, row.payload);
      await deps.markSent(row.id, deps.now());
      result.sent += 1;
    } catch (error) {
      const message = (error instanceof Error ? error.message : String(error)).slice(0, ERROR_MAX);
      if (error instanceof NotificationConfigError || row.attempts + 1 >= MAX_NOTIFICATION_ATTEMPTS) {
        await (error instanceof NotificationConfigError
          ? deps.markFailed(row.id, message)
          : deps.markAttemptFailed(row.id, message, MAX_NOTIFICATION_ATTEMPTS));
        result.failed += 1;
      } else {
        await deps.markAttemptFailed(row.id, message, MAX_NOTIFICATION_ATTEMPTS);
        result.retrying += 1;
      }
    }
  }
  return result;
}
