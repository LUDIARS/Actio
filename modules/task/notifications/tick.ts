/**
 * 起動時 + 1 分間隔で、 期限前通知の検出と送信箱の配送を回す (task-integration §2.3)。
 * テスト / SIM では呼ばない (呼び出しは起動経路 1 箇所のみ)。
 */

import { taskNotificationRepo, taskRepo, teamRefRepo } from "../../../src/db/repository.js";
import { defaultTeamSettings, TeamSettingsSchema } from "../team/settings.js";
import { createConcordiaSink } from "./concordia-sink.js";
import { scanDeadlineNotifications } from "./deadline-scanner.js";
import { dispatchPendingNotifications } from "./dispatcher.js";
import { enqueueNotifications } from "./enqueue.js";
import { createMemoriaSink } from "./memoria-sink.js";
import { toTaskSnapshot } from "./snapshot.js";

const NOTIFICATION_TICK_MS = 60_000;

async function notifyBeforeMinutes(teamId: string | null): Promise<number> {
  if (!teamId) return defaultTeamSettings().notify_before_minutes;
  const team = await teamRefRepo.findById(teamId);
  if (!team) return defaultTeamSettings().notify_before_minutes;
  return TeamSettingsSchema.parse(team.settings).notify_before_minutes;
}

export async function runNotificationCycle(): Promise<void> {
  await scanDeadlineNotifications({
    listTasksWithDeadlineBetween: async (from, to) => (await taskRepo.listWithDeadlineBetween(from, to)).map(toTaskSnapshot),
    notifyBeforeMinutes,
    enqueue: (intents) => enqueueNotifications(intents),
    now: () => new Date(),
  });
  const result = await dispatchPendingNotifications({
    listPending: (limit) => taskNotificationRepo.listPending(limit),
    markSent: (id, at) => taskNotificationRepo.markSent(id, at),
    markFailed: (id, error) => taskNotificationRepo.markFailed(id, error),
    markAttemptFailed: (id, error, maxAttempts) => taskNotificationRepo.markAttemptFailed(id, error, maxAttempts),
    sinks: { concordia: createConcordiaSink(), memoria: createMemoriaSink() },
    now: () => new Date(),
  });
  if (result.failed > 0) console.warn(`[task-notify] ${result.failed} 件の通知が failed になりました (GET /api/tasks/notifications?status=failed)`);
}

export function startNotificationTick(intervalMs: number = NOTIFICATION_TICK_MS): () => void {
  let isRunning = false;
  const runOnce = async (): Promise<void> => {
    if (isRunning) return;
    isRunning = true;
    try {
      await runNotificationCycle();
    } catch (error) {
      // Last-resort containment: a scheduler tick must never become an unhandled rejection.
      console.warn(`[task-notify] 通知 tick でエラーを隔離しました: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      isRunning = false;
    }
  };
  void runOnce();
  const timer = setInterval(() => void runOnce(), intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
