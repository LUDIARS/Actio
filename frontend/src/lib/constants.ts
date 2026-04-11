export const API_BASE = import.meta.env.VITE_API_BASE ?? "";

export const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;
export const DAYS_COUNT = 7;
export const PERIODS_COUNT = 11;

export function getPeriodTime(period: number) {
  const startHour = 9;
  const startMinute = 30;
  const totalMinutes = startHour * 60 + startMinute + period * 60;
  const endMinutes = totalMinutes + 60;
  const format = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}:${String(mm).padStart(2, "0")}`;
  };
  return { start: format(totalMinutes), end: format(endMinutes) };
}

export function getPeriodLabel(period: number) {
  const { start, end } = getPeriodTime(period);
  return `${period + 1}限 (${start}–${end})`;
}

export type SlotStatus = "free" | "class" | "personal" | "event" | "reserved";

export const SLOT_COLORS: Record<SlotStatus, string> = {
  free: "#f0fdf4",
  class: "#dbeafe",
  personal: "#fef3c7",
  event: "#ede9fe",
  reserved: "#fce7f3",
};

export const CANDIDATE_COLORS = {
  low: "#6E7681",
  medium: "#D29922",
  high: "#3FB950",
} as const;
