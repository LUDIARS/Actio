/**
 * Holiday utility functions for scheduling
 *
 * プラン反映・スケジュール配置時に休日や審査会期間を考慮するためのユーティリティ
 */

import { holidayRepo, groupEventRepo } from "../../src/db/repository.js";
// japanese-holidays は @ludiars/schedula-module-holiday から取得
import { isNonBusinessDay, getJapaneseHolidays } from "@ludiars/schedula-module-holiday";

export interface SchedulingOptions {
  /** 休日を考慮するか (default: true) */
  considerHolidays?: boolean;
  /** 業務時間(授業予定曜日)を考慮するか (default: true) */
  considerBusinessDays?: boolean;
  /** 対象グループID */
  groupId?: string;
}

/**
 * 指定期間内の「予定を入れてはいけない日」の日付セットを返す
 *
 * 以下を考慮:
 * - 日本の祝日
 * - DB登録済みの休日(システム全体 + グループ固有)
 * - グループの審査会期間 (examination_period)
 * - 土日
 */
export async function getBlockedDates(
  startDate: string,
  endDate: string,
  options: SchedulingOptions = {}
): Promise<Set<string>> {
  const {
    considerHolidays = true,
    considerBusinessDays = true,
    groupId,
  } = options;

  const blockedDates = new Set<string>();

  if (!considerHolidays && !considerBusinessDays) {
    return blockedDates;
  }

  // 期間内の日付を走査
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);

    if (considerBusinessDays) {
      // 土日
      const dayOfWeek = d.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        blockedDates.add(dateStr);
        continue;
      }
    }

    if (considerHolidays) {
      // 日本の祝日
      if (isNonBusinessDay(dateStr)) {
        blockedDates.add(dateStr);
        continue;
      }
    }
  }

  if (considerHolidays) {
    // DB登録の休日
    const dbHolidays = await holidayRepo.findByDateRange(startDate, endDate, groupId);
    for (const h of dbHolidays) {
      const hStart = new Date(h.date + "T00:00:00");
      const hEnd = h.endDate ? new Date(h.endDate + "T00:00:00") : hStart;
      for (let d = new Date(hStart); d <= hEnd; d.setDate(d.getDate() + 1)) {
        blockedDates.add(d.toISOString().slice(0, 10));
      }
    }

    // グループの審査会期間・休日イベント
    if (groupId) {
      const groupEvents = await groupEventRepo.findByGroupId(groupId);
      for (const ev of groupEvents) {
        if (ev.eventType === "examination_period" || ev.eventType === "holiday") {
          const evStart = new Date(ev.date + "T00:00:00");
          const evEnd = ev.endDate ? new Date(ev.endDate + "T00:00:00") : evStart;
          for (let d = new Date(evStart); d <= evEnd; d.setDate(d.getDate() + 1)) {
            blockedDates.add(d.toISOString().slice(0, 10));
          }
        }
      }
    }
  }

  return blockedDates;
}

/**
 * 指定期間内の「授業がある曜日」を返す (0=月〜4=金)
 * デフォルトは月〜金
 */
export function getClassDays(options: SchedulingOptions = {}): Set<number> {
  if (!options.considerBusinessDays) {
    // 全曜日
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  }
  // デフォルト: 月〜金 (0-4)
  return new Set([0, 1, 2, 3, 4]);
}

/**
 * 指定日付が特定の曜日(0=月~6=日)に該当するかチェック
 * YYYY-MM-DD → 曜日番号 (0=月, 1=火, ..., 6=日)
 */
export function getWeekdayFromDate(dateStr: string): number {
  const d = new Date(dateStr + "T00:00:00");
  // JavaScript: 0=Sun, 1=Mon, ..., 6=Sat
  // System:     0=Mon, 1=Tue, ..., 6=Sun
  const jsDay = d.getDay();
  return jsDay === 0 ? 6 : jsDay - 1;
}
