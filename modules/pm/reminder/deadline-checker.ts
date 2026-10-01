/**
 * 納期チェックとリマインダー設定 (純粋関数, PLAN §2, completion.md AT-PM-REMINDER)
 *
 * 日付はサーバーのローカル日付で比べる (UTC の日付だと日本時間の朝に前日扱いになる)。
 */

import { z } from "zod";
import type { ReminderSettings } from "../types.js";

interface TaskWithDueDate {
  id: string;
  title: string;
  dueDate: string | null;
  assignees: string[];
  projectId: string;
  status: string;
}

export const reminderSettingsSchema = z.object({
  deadlineWarningDays: z.number().int().min(0).max(30),
  dailyCheckEnabled: z.boolean(),
  dailyCheckTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  overdueCheckEnabled: z.boolean(),
}).strict();

/** YYYY-MM-DD (ローカル日付) */
export function localDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * 納期警告対象のタスクをフィルタリング (今日〜警告日数後、未完了)
 */
export function findWarningTasks<T extends TaskWithDueDate>(
  tasks: T[],
  settings: ReminderSettings,
  today: Date = new Date()
): T[] {
  const todayStr = localDateString(today);
  const warningStr = localDateString(addDays(today, settings.deadlineWarningDays));

  return tasks.filter((task) => {
    if (!task.dueDate || task.status === "closed") return false;
    return task.dueDate >= todayStr && task.dueDate <= warningStr;
  });
}

/**
 * 納期超過タスクをフィルタリング (納期が昨日以前、未完了)
 */
export function findOverdueTasks<T extends TaskWithDueDate>(
  tasks: T[],
  today: Date = new Date()
): T[] {
  const todayStr = localDateString(today);

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

/** 保存値 (null = 未設定) を設定に戻す。壊れた値は既定値で埋める。 */
export function resolveReminderSettings(stored: Record<string, unknown> | null | undefined): ReminderSettings {
  const parsed = reminderSettingsSchema.safeParse({ ...getDefaultReminderSettings(), ...(stored ?? {}) });
  return parsed.success ? parsed.data : getDefaultReminderSettings();
}

/**
 * 当日のチェック時刻を過ぎているか。納期の警告・超過も日次レポートもこの時刻以降に送る
 * (当日分の送信済み判定は dedupe キーが担う)。
 */
export function isPastDailyCheckTime(settings: ReminderSettings, now: Date): boolean {
  const [hours, minutes] = settings.dailyCheckTime.split(":").map(Number);
  return now.getHours() * 60 + now.getMinutes() >= hours * 60 + minutes;
}
