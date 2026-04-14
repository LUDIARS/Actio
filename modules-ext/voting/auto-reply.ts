import {
  personalEventRepo,
  groupMemberRepo,
  groupScheduleRepo,
} from "../../src/db/repository.js";
import { DAYS_COUNT, PERIODS_COUNT, DAY_LABELS } from "../../src/shared/constants.js";
import type { VoteAnswer } from "../../src/shared/constants.js";

/**
 * 候補ラベルからday/periodを推定し、ユーザーの予定と照合して自動回答を生成する。
 *
 * ラベルのフォーマット例:
 * - "月 1限" → day=0, period=0
 * - "3/20(木) 10:30〜11:30" → day=3, period=1
 *
 * 予定が空き → ok
 * 予定あり → ng
 * 推定不能 → null (自動回答スキップ)
 */
export async function generateAutoReply(
  userId: string,
  candidateLabel: string
): Promise<VoteAnswer | null> {
  const slot = parseCandidateLabel(candidateLabel);
  if (!slot) return null;

  const isBusy = await isUserBusy(userId, slot.day, slot.period);

  if (isBusy) {
    return "ng";
  }
  return "ok";
}

/**
 * ユーザーが指定スロットで busy かどうかを判定する。
 * リポジトリ層のみ使用 (PostgreSQL対応)。
 */
async function isUserBusy(userId: string, day: number, period: number): Promise<boolean> {
  // 個人予定をチェック
  const personalEvent = await personalEventRepo.findByUserDayPeriod(userId, day, period);
  if (personalEvent) return true;

  // ユーザーが所属するグループのスケジュールをバッチ取得
  const memberships = await groupMemberRepo.findByUserId(userId);
  const groupIds = memberships.map((m: { groupId: string }) => m.groupId);
  const allSchedules = await groupScheduleRepo.findByGroupIds(groupIds);

  for (const s of allSchedules) {
    if (s.day === day && period >= s.period && period < s.period + s.duration) {
      return true;
    }
  }

  return false;
}

/**
 * 候補ラベルから曜日・コマを解析する。
 *
 * 対応フォーマット:
 * 1. "月 1限" / "火 3限" (曜日 + コマ)
 * 2. "3/20(木) 10:30〜11:30" (日付 + 曜日 + 時刻)
 */
export function parseCandidateLabel(
  label: string
): { day: number; period: number } | null {
  // パターン1: "月 1限" 形式
  const dayPeriodMatch = label.match(
    /^([月火水木金土日])\s*(\d{1,2})限$/
  );
  if (dayPeriodMatch) {
    const dayIndex = DAY_LABELS.indexOf(dayPeriodMatch[1] as any);
    const period = parseInt(dayPeriodMatch[2], 10) - 1;
    if (dayIndex >= 0 && period >= 0 && period < PERIODS_COUNT) {
      return { day: dayIndex, period };
    }
  }

  // パターン2: "M/D(曜) HH:MM〜HH:MM" or "M/D(曜) HH:MM-HH:MM"
  const dateTimeMatch = label.match(
    /\d{1,2}\/\d{1,2}\(([月火水木金土日])\)\s*(\d{1,2}):(\d{2})/
  );
  if (dateTimeMatch) {
    const dayIndex = DAY_LABELS.indexOf(dateTimeMatch[1] as any);
    const hour = parseInt(dateTimeMatch[2], 10);
    const minute = parseInt(dateTimeMatch[3], 10);

    if (dayIndex >= 0) {
      // 時刻からコマを逆算
      const period = timeToPeriod(hour, minute);
      if (period !== null) {
        return { day: dayIndex, period };
      }
    }
  }

  return null;
}

/**
 * 時刻(時:分)からコマ番号(0-based)に変換する。
 * 9:30開始、1コマ=60分。
 */
function timeToPeriod(hour: number, minute: number): number | null {
  const totalMinutes = hour * 60 + minute;
  const startMinutes = 9 * 60 + 30; // 9:30

  if (totalMinutes < startMinutes) return null;

  const period = Math.floor((totalMinutes - startMinutes) / 60);
  if (period >= 0 && period < PERIODS_COUNT) {
    return period;
  }
  return null;
}
