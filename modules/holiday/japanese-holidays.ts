/**
 * 日本の祝日データ
 *
 * 国民の祝日に関する法律に基づく祝日一覧を返す。
 * 外部APIに依存せず、ルールベースで年ごとに生成する。
 */

interface JapaneseHoliday {
  date: string; // YYYY-MM-DD
  name: string;
}

/**
 * 春分日を計算 (1900-2099年)
 */
function getVernalEquinox(year: number): number {
  if (year >= 1900 && year <= 1979) return Math.floor(20.8357 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4));
  if (year >= 1980 && year <= 2099) return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return 20; // fallback
}

/**
 * 秋分日を計算 (1900-2099年)
 */
function getAutumnalEquinox(year: number): number {
  if (year >= 1900 && year <= 1979) return Math.floor(23.2588 + 0.242194 * (year - 1980) - Math.floor((year - 1983) / 4));
  if (year >= 1980 && year <= 2099) return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  return 23; // fallback
}

/**
 * 第n月曜日の日付を返す
 */
function getNthMonday(year: number, month: number, n: number): number {
  const firstDay = new Date(year, month - 1, 1).getDay();
  const firstMonday = firstDay <= 1 ? 2 - firstDay : 9 - firstDay;
  return firstMonday + (n - 1) * 7;
}

function fmt(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * 指定年の日本の祝日一覧を生成
 */
export function getJapaneseHolidays(year: number): JapaneseHoliday[] {
  const holidays: JapaneseHoliday[] = [];

  // 元日
  holidays.push({ date: fmt(year, 1, 1), name: "元日" });

  // 成人の日 (1月第2月曜)
  holidays.push({ date: fmt(year, 1, getNthMonday(year, 1, 2)), name: "成人の日" });

  // 建国記念の日
  holidays.push({ date: fmt(year, 2, 11), name: "建国記念の日" });

  // 天皇誕生日 (2/23, 2020年〜)
  if (year >= 2020) {
    holidays.push({ date: fmt(year, 2, 23), name: "天皇誕生日" });
  }

  // 春分の日
  const vernalDay = getVernalEquinox(year);
  holidays.push({ date: fmt(year, 3, vernalDay), name: "春分の日" });

  // 昭和の日
  holidays.push({ date: fmt(year, 4, 29), name: "昭和の日" });

  // 憲法記念日
  holidays.push({ date: fmt(year, 5, 3), name: "憲法記念日" });

  // みどりの日
  holidays.push({ date: fmt(year, 5, 4), name: "みどりの日" });

  // こどもの日
  holidays.push({ date: fmt(year, 5, 5), name: "こどもの日" });

  // 海の日 (7月第3月曜)
  holidays.push({ date: fmt(year, 7, getNthMonday(year, 7, 3)), name: "海の日" });

  // 山の日 (8/11)
  holidays.push({ date: fmt(year, 8, 11), name: "山の日" });

  // 敬老の日 (9月第3月曜)
  holidays.push({ date: fmt(year, 9, getNthMonday(year, 9, 3)), name: "敬老の日" });

  // 秋分の日
  const autumnalDay = getAutumnalEquinox(year);
  holidays.push({ date: fmt(year, 9, autumnalDay), name: "秋分の日" });

  // スポーツの日 (10月第2月曜)
  holidays.push({ date: fmt(year, 10, getNthMonday(year, 10, 2)), name: "スポーツの日" });

  // 文化の日
  holidays.push({ date: fmt(year, 11, 3), name: "文化の日" });

  // 勤労感謝の日
  holidays.push({ date: fmt(year, 11, 23), name: "勤労感謝の日" });

  // 振替休日の処理: 祝日が日曜に当たる場合、翌営業日を振替休日とする
  const holidaySet = new Set(holidays.map((h) => h.date));
  const substitutes: JapaneseHoliday[] = [];

  for (const h of holidays) {
    const d = new Date(h.date + "T00:00:00");
    if (d.getDay() === 0) {
      // 日曜 → 次の平日(非祝日)を振替休日
      let subDate = new Date(d);
      do {
        subDate.setDate(subDate.getDate() + 1);
      } while (holidaySet.has(subDate.toISOString().slice(0, 10)) || subDate.getDay() === 0);
      const subStr = subDate.toISOString().slice(0, 10);
      substitutes.push({ date: subStr, name: "振替休日" });
      holidaySet.add(subStr);
    }
  }

  // 国民の休日: 2つの祝日に挟まれた平日
  const sortedDates = [...holidaySet].sort();
  for (let i = 0; i < sortedDates.length - 1; i++) {
    const curr = new Date(sortedDates[i] + "T00:00:00");
    const next = new Date(sortedDates[i + 1] + "T00:00:00");
    const diff = (next.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24);
    if (diff === 2) {
      const between = new Date(curr);
      between.setDate(between.getDate() + 1);
      const betweenStr = between.toISOString().slice(0, 10);
      if (!holidaySet.has(betweenStr) && between.getDay() !== 0) {
        substitutes.push({ date: betweenStr, name: "国民の休日" });
      }
    }
  }

  holidays.push(...substitutes);
  holidays.sort((a, b) => a.date.localeCompare(b.date));

  return holidays;
}

/**
 * 指定の日付が祝日かチェック
 */
export function isJapaneseHoliday(dateStr: string): JapaneseHoliday | null {
  const year = parseInt(dateStr.slice(0, 4));
  const holidays = getJapaneseHolidays(year);
  return holidays.find((h) => h.date === dateStr) || null;
}

/**
 * 指定の日付が休日（土日+祝日）かチェック
 */
export function isNonBusinessDay(dateStr: string): boolean {
  const d = new Date(dateStr + "T00:00:00");
  const dayOfWeek = d.getDay();
  // 土日
  if (dayOfWeek === 0 || dayOfWeek === 6) return true;
  // 祝日
  return isJapaneseHoliday(dateStr) !== null;
}
