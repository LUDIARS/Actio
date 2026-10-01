/**
 * リマインダー巡回ユースケース (PLAN §2, completion.md AT-PM-REMINDER)
 *
 * 当日のチェック時刻を過ぎたら、納期の警告・超過と日次レポートの通知を積む。
 * 1 日 1 回の制限は dedupe キー (タスク + 納期 + 当日 / プロジェクト + 当日) が担う。
 */

import { deadlineNotification, reportReadyNotification, type PmNotificationIntent } from "../domain/notifications.js";
import {
  findOverdueTasks,
  findWarningTasks,
  isPastDailyCheckTime,
  localDateString,
  resolveReminderSettings,
} from "../reminder/deadline-checker.js";
import type { PmProjectRow, PmTaskRow } from "./ports.js";

export interface ReminderDeps {
  listTasks: (projectId: string) => Promise<PmTaskRow[]>;
  enqueue: (intents: readonly PmNotificationIntent[]) => Promise<void>;
  now: () => Date;
}

function asDueTask(task: PmTaskRow, projectId: string) {
  return {
    id: task.id,
    projectId,
    title: task.title,
    dueDate: task.dueDate,
    assignees: task.assignees ?? [],
    status: task.status,
  };
}

export function buildDailySummary(tasks: readonly PmTaskRow[], warningCount: number, overdueCount: number): string {
  const closed = tasks.filter((t) => t.status === "closed").length;
  const rate = tasks.length > 0 ? Math.round((closed / tasks.length) * 100) : 0;
  return `完了 ${closed}/${tasks.length} (${rate}%)・納期間近 ${warningCount} 件・納期超過 ${overdueCount} 件`;
}

/** 1 プロジェクト分の通知の意図を作る。積む件数 (dedupe 前) を返す。 */
export async function runProjectReminders(project: PmProjectRow, deps: ReminderDeps): Promise<number> {
  const now = deps.now();
  const settings = resolveReminderSettings(project.reminderSettings);
  if (!isPastDailyCheckTime(settings, now)) return 0;

  const tasks = await deps.listTasks(project.id);
  const due = tasks.map((t) => asDueTask(t, project.id));
  const today = localDateString(now);
  const warnings = findWarningTasks(due, settings, now);
  const overdue = settings.overdueCheckEnabled ? findOverdueTasks(due, now) : [];

  const intents: PmNotificationIntent[] = [
    ...warnings.map((t) => deadlineNotification("warning", { ...t, dueDate: t.dueDate as string }, today)),
    ...overdue.map((t) => deadlineNotification("overdue", { ...t, dueDate: t.dueDate as string }, today)),
  ];
  if (settings.dailyCheckEnabled) {
    intents.push(reportReadyNotification(project, today, buildDailySummary(tasks, warnings.length, overdue.length)));
  }
  if (intents.length > 0) await deps.enqueue(intents);
  return intents.length;
}
