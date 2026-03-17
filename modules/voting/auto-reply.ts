import { db, schema, curriculumSchema } from "../../src/db/connection.js";
import { eq, and } from "drizzle-orm";
import {
  createEmptySlotMatrix,
  mergeClassSchedule,
  mergeReservations,
} from "../integration/integration.js";
import { DAYS_COUNT, PERIODS_COUNT, DAY_LABELS } from "../../src/shared/constants.js";
import type { VoteAnswer } from "../../src/shared/constants.js";
import type { UnifiedSlot } from "../../src/shared/types.js";

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

  const matrix = await getUserSlotMatrix(userId);
  const userSlot = matrix[slot.day]?.[slot.period];

  if (!userSlot) return null;

  if (userSlot.status === "free") {
    return "ok";
  }
  return "ng";
}

/**
 * ユーザーの統合スケジュールマトリクスを取得する。
 * M3 の getMemberSlots と同様のロジック。
 */
async function getUserSlotMatrix(userId: string): Promise<UnifiedSlot[][]> {
  let matrix = createEmptySlotMatrix();
  const currentTerm = `term-${new Date().getFullYear()}`;

  // メンバープロファイル取得
  const [profile] = db
    .select()
    .from(schema.memberProfiles)
    .where(eq(schema.memberProfiles.userId, userId))
    .limit(1)
    .all();

  if (profile) {
    // 授業スケジュールをマージ
    const classEntries = db
      .select({
        day: schema.scheduleEntries.day,
        period: schema.scheduleEntries.period,
        major: curriculumSchema.curricula.departmentName,
      })
      .from(schema.scheduleEntries)
      .innerJoin(curriculumSchema.curricula, eq(schema.scheduleEntries.curriculumId, curriculumSchema.curricula.id))
      .where(
        and(
          eq(schema.scheduleEntries.termId, currentTerm),
          eq(schema.scheduleEntries.isConfirmed, true),
          eq(curriculumSchema.curricula.departmentName, profile.major)
        )
      )
      .all();

    matrix = mergeClassSchedule(matrix, classEntries);
  }

  // キャッシュ済み統合スロットをマージ
  const cachedSlots = db
    .select()
    .from(schema.unifiedSlots)
    .where(eq(schema.unifiedSlots.userId, userId))
    .all();

  for (const slot of cachedSlots) {
    if (
      slot.day >= 0 && slot.day < DAYS_COUNT &&
      slot.period >= 0 && slot.period < PERIODS_COUNT &&
      matrix[slot.day][slot.period].status === "free"
    ) {
      matrix[slot.day][slot.period] = {
        day: slot.day,
        period: slot.period,
        status: slot.status as UnifiedSlot["status"],
        majorLabel: slot.majorLabel,
        isPrivate: slot.isPrivate,
        sourceModule: slot.sourceModule,
      };
    }
  }

  // 予約をマージ
  const reservations = db
    .select()
    .from(schema.reservations)
    .where(eq(schema.reservations.status, "confirmed"))
    .all();

  const userRes = reservations.filter((r) =>
    (r.participants as string[]).includes(userId)
  );

  matrix = mergeReservations(
    matrix,
    userRes.map((r) => ({ day: r.day, period: r.period, title: r.title }))
  );

  return matrix;
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
