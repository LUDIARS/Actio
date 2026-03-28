/**
 * 自由テキストからリマインダー情報を抽出するパーサー
 *
 * 日本語の自然文から日時とタイトルを解析する。
 * 例:
 *   "明日の10時に会議" → { remindAt: "2026-03-29T10:00:00", title: "会議" }
 *   "来週月曜日に報告書提出" → { remindAt: "2026-04-06T09:00:00", title: "報告書提出" }
 *   "3月30日 15:00 歯医者" → { remindAt: "2026-03-30T15:00:00", title: "歯医者" }
 */

export interface ParsedReminder {
  title: string;
  remindAt: string; // ISO 8601
  confidence: number; // 0.0 ~ 1.0
}

const DAY_OF_WEEK_MAP: Record<string, number> = {
  "月": 1, "火": 2, "水": 3, "木": 4, "金": 5, "土": 6, "日": 0,
  "月曜": 1, "火曜": 2, "水曜": 3, "木曜": 4, "金曜": 5, "土曜": 6, "日曜": 0,
  "月曜日": 1, "火曜日": 2, "水曜日": 3, "木曜日": 4, "金曜日": 5, "土曜日": 6, "日曜日": 0,
};

/** 日時部分を除去してタイトルを抽出 */
function extractTitle(text: string, dateTimePatterns: RegExp[]): string {
  let title = text;
  for (const pattern of dateTimePatterns) {
    title = title.replace(pattern, "");
  }
  // 接続詞・助詞を除去
  title = title.replace(/^[にのへはをでと、,\s]+/, "");
  title = title.replace(/[にのへはをでと、,\s]+$/, "");
  return title.trim() || text.trim();
}

/** テキストから日時情報を抽出 */
export function parseReminderText(text: string, now?: Date): ParsedReminder {
  const baseDate = now || new Date();
  let remindAt: Date | null = null;
  let confidence = 0;
  const matchedPatterns: RegExp[] = [];

  // --- 絶対日時パターン ---

  // "M月D日 HH:MM" or "M/D HH:MM"
  const absDateTimeMatch = text.match(/(\d{1,2})[月/](\d{1,2})日?\s*(\d{1,2}):(\d{2})/);
  if (absDateTimeMatch) {
    const month = parseInt(absDateTimeMatch[1], 10) - 1;
    const day = parseInt(absDateTimeMatch[2], 10);
    const hour = parseInt(absDateTimeMatch[3], 10);
    const minute = parseInt(absDateTimeMatch[4], 10);
    remindAt = new Date(baseDate.getFullYear(), month, day, hour, minute, 0);
    if (remindAt < baseDate) {
      remindAt.setFullYear(remindAt.getFullYear() + 1);
    }
    confidence = 0.9;
    matchedPatterns.push(/(\d{1,2})[月/](\d{1,2})日?\s*(\d{1,2}):(\d{2})/);
  }

  // "M月D日" (without time → default 09:00)
  if (!remindAt) {
    const absDateMatch = text.match(/(\d{1,2})[月/](\d{1,2})日?/);
    if (absDateMatch) {
      const month = parseInt(absDateMatch[1], 10) - 1;
      const day = parseInt(absDateMatch[2], 10);

      // Check if there's a separate time
      const separateTime = text.match(/(\d{1,2})[時:](\d{2})?分?/);
      const hour = separateTime ? parseInt(separateTime[1], 10) : 9;
      const minute = separateTime && separateTime[2] ? parseInt(separateTime[2], 10) : 0;

      remindAt = new Date(baseDate.getFullYear(), month, day, hour, minute, 0);
      if (remindAt < baseDate) {
        remindAt.setFullYear(remindAt.getFullYear() + 1);
      }
      confidence = separateTime ? 0.85 : 0.7;
      matchedPatterns.push(/(\d{1,2})[月/](\d{1,2})日?/);
      if (separateTime) matchedPatterns.push(/(\d{1,2})[時:](\d{2})?分?/);
    }
  }

  // --- 相対日時パターン ---

  if (!remindAt) {
    // "今日" / "明日" / "明後日"
    const relDayMatch = text.match(/(今日|明日|明後日|あさって)/);
    if (relDayMatch) {
      const dayOffset = relDayMatch[1] === "今日" ? 0 :
                         relDayMatch[1] === "明日" ? 1 : 2;
      remindAt = new Date(baseDate);
      remindAt.setDate(remindAt.getDate() + dayOffset);

      // 時間指定があれば適用
      const timeMatch = text.match(/(\d{1,2})[時:](\d{2})?分?/);
      if (timeMatch) {
        remindAt.setHours(parseInt(timeMatch[1], 10), timeMatch[2] ? parseInt(timeMatch[2], 10) : 0, 0, 0);
        confidence = 0.9;
        matchedPatterns.push(/(\d{1,2})[時:](\d{2})?分?/);
      } else {
        remindAt.setHours(9, 0, 0, 0);
        confidence = 0.7;
      }
      matchedPatterns.push(/(今日|明日|明後日|あさって)/);
    }
  }

  if (!remindAt) {
    // "来週X曜日" / "今週X曜日"
    const weekDayMatch = text.match(/(今週|来週|再来週)?\s*(月|火|水|木|金|土|日)曜?日?/);
    if (weekDayMatch) {
      const weekOffset = weekDayMatch[1] === "来週" ? 1 :
                         weekDayMatch[1] === "再来週" ? 2 : 0;
      const targetDow = DAY_OF_WEEK_MAP[weekDayMatch[2]];
      if (targetDow !== undefined) {
        const currentDow = baseDate.getDay();
        let daysUntil = targetDow - currentDow;
        if (daysUntil <= 0 && weekOffset === 0) daysUntil += 7;
        daysUntil += weekOffset * 7;

        remindAt = new Date(baseDate);
        remindAt.setDate(remindAt.getDate() + daysUntil);

        const timeMatch = text.match(/(\d{1,2})[時:](\d{2})?分?/);
        if (timeMatch) {
          remindAt.setHours(parseInt(timeMatch[1], 10), timeMatch[2] ? parseInt(timeMatch[2], 10) : 0, 0, 0);
          confidence = 0.85;
          matchedPatterns.push(/(\d{1,2})[時:](\d{2})?分?/);
        } else {
          remindAt.setHours(9, 0, 0, 0);
          confidence = 0.65;
        }
        matchedPatterns.push(/(今週|来週|再来週)?\s*(月|火|水|木|金|土|日)曜?日?/);
      }
    }
  }

  if (!remindAt) {
    // "N時間後" / "N分後"
    const relTimeMatch = text.match(/(\d+)\s*(時間|分)後/);
    if (relTimeMatch) {
      const amount = parseInt(relTimeMatch[1], 10);
      const unit = relTimeMatch[2];
      remindAt = new Date(baseDate);
      if (unit === "時間") {
        remindAt.setHours(remindAt.getHours() + amount);
      } else {
        remindAt.setMinutes(remindAt.getMinutes() + amount);
      }
      confidence = 0.95;
      matchedPatterns.push(/(\d+)\s*(時間|分)後/);
    }
  }

  // フォールバック: 日時が解析できない場合は1時間後
  if (!remindAt) {
    remindAt = new Date(baseDate);
    remindAt.setHours(remindAt.getHours() + 1);
    confidence = 0.3;
  }

  const title = matchedPatterns.length > 0
    ? extractTitle(text, matchedPatterns)
    : text.trim();

  return {
    title: title || text.trim(),
    remindAt: remindAt.toISOString(),
    confidence,
  };
}
