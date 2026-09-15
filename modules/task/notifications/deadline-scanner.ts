/**
 * 期限が近いタスクを見つけて期限前通知を積む (task-integration §2.1 task.deadline_soon)。
 * 通知の分数はチーム設定 notify_before_minutes (個人タスクは既定値)。
 */

import { deadlineSoonNotification, type NotificationIntent, type TaskSnapshot } from "./events.js";

/** チーム設定の上限 (settings.ts の max) と揃える。 これより先の期限は読まない。 */
export const MAX_NOTIFY_BEFORE_MINUTES = 1440;

export interface DeadlineScanDeps {
  listTasksWithDeadlineBetween: (from: Date, to: Date) => Promise<TaskSnapshot[]>;
  notifyBeforeMinutes: (teamId: string | null) => Promise<number>;
  enqueue: (intents: NotificationIntent[]) => Promise<number>;
  now: () => Date;
}

export async function scanDeadlineNotifications(deps: DeadlineScanDeps): Promise<number> {
  const now = deps.now();
  const tasks = await deps.listTasksWithDeadlineBetween(now, new Date(now.getTime() + MAX_NOTIFY_BEFORE_MINUTES * 60_000));
  const minutesByTeam = new Map<string, number>();
  const intents: NotificationIntent[] = [];
  for (const task of tasks) {
    const key = task.teamId ?? "";
    if (!minutesByTeam.has(key)) minutesByTeam.set(key, await deps.notifyBeforeMinutes(task.teamId));
    const intent = deadlineSoonNotification(task, now, minutesByTeam.get(key) as number);
    if (intent) intents.push(intent);
  }
  return intents.length === 0 ? 0 : deps.enqueue(intents);
}
