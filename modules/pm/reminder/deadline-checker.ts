/**
 * 納期チェック & リマインダー発火
 */

import type { ReminderSettings } from "../types.js";

interface TaskWithDueDate {
  id: string;
  title: string;
  dueDate: string | null;
  assignees: string[];
  projectId: string;
  status: string;
}

/**
 * 日付に日数を加算
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 納期警告対象のタスクをフィルタリング
 */
export function findWarningTasks(
  tasks: TaskWithDueDate[],
  settings: ReminderSettings,
  today: Date = new Date()
): TaskWithDueDate[] {
  const warningDate = addDays(today, settings.deadlineWarningDays);
  const todayStr = today.toISOString().split("T")[0];
  const warningStr = warningDate.toISOString().split("T")[0];

  return tasks.filter((task) => {
    if (!task.dueDate || task.status === "closed") return false;
    return task.dueDate >= todayStr && task.dueDate <= warningStr;
  });
}

/**
 * 納期超過タスクをフィルタリング
 */
export function findOverdueTasks(
  tasks: TaskWithDueDate[],
  today: Date = new Date()
): TaskWithDueDate[] {
  const todayStr = today.toISOString().split("T")[0];

  return tasks.filter((task) => {
    if (!task.dueDate || task.status === "closed") return false;
    return task.dueDate < todayStr;
  });
}

/**
 * デフォルトのリマインダー設定
 */
export function getDefaultReminderSettings(): ReminderSettings {
  return {
    deadlineWarningDays: 3,
    dailyCheckEnabled: true,
    dailyCheckTime: "09:00",
    overdueCheckEnabled: true,
  };
}
