/** Total number of days in a week (月〜日) */
export const DAYS_COUNT = 7;

/** Total number of periods per day (1限〜11限) */
export const PERIODS_COUNT = 11;

/** Day labels (Japanese) */
export const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

/** Period start time: 09:30 */
export const PERIOD_START_HOUR = 9;
export const PERIOD_START_MINUTE = 30;

/** Each period = 1 hour */
export const PERIOD_DURATION_MINUTES = 60;

/** Get start/end time for a period index (0-based) */
export function getPeriodTime(periodIndex: number): {
  start: string;
  end: string;
} {
  const startHour = PERIOD_START_HOUR + periodIndex;
  const endHour = startHour + 1;
  const fmt = (h: number) =>
    `${String(h).padStart(2, "0")}:${String(PERIOD_START_MINUTE).padStart(2, "0")}`;
  return { start: fmt(startHour), end: fmt(endHour) };
}

/** Room types */
export const ROOM_TYPES = [
  "講義室",
  "演習室",
  "PC室",
  "実験室",
  "大講義室",
] as const;
export type RoomType = (typeof ROOM_TYPES)[number];

/** Slot status for unified slots (M2) */
export const SLOT_STATUSES = [
  "free",
  "class",
  "personal",
  "event",
  "reserved",
] as const;
export type SlotStatus = (typeof SLOT_STATUSES)[number];

/** Reservation status */
export const RESERVATION_STATUSES = [
  "confirmed",
  "cancelled",
  "pending",
] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/** User roles */
export const USER_ROLES = [
  "admin",
  "group_leader",
  "general",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

/** ロール表示ラベル (日本語) */
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "管理者",
  group_leader: "グループリーダー",
  general: "一般",
};

/** Schedule generation modes */
export const SCHEDULE_MODES = ["pack", "spread"] as const;
export type ScheduleMode = (typeof SCHEDULE_MODES)[number];

/** Swap candidate highlight colors */
export const SWAP_COLORS = {
  LOW: "#6E7681", // ≤3 candidates
  MEDIUM: "#D29922", // 4-14 candidates
  HIGH: "#3FB950", // ≥15 candidates
} as const;

/** Max swap chain depth */
export const MAX_SWAP_DEPTH = 2;

/** Candidate count threshold for skipping recalculation */
export const SKIP_RECALC_THRESHOLD = 15;

/** Notification event names */
export const EVENT_NAMES = {
  SCHEDULE_CONFIRMED: "schedule.confirmed",
  SCHEDULE_CHANGED: "schedule.changed",
  RESERVATION_CREATED: "reservation.created",
  RESERVATION_UPDATED: "reservation.updated",
  RESERVATION_CANCELLED: "reservation.cancelled",
  RESERVATION_REMINDER: "reservation.reminder",
  SYNC_CONFLICT: "sync.conflict",
  REMINDER_MORNING: "reminder.morning",
} as const;

/** Event module definition for UI grouping */
export interface EventModuleDefinition {
  module: string;
  label: string;
  events: { name: string; label: string }[];
}

/** Event modules — Japanese labels, grouped by module */
export const EVENT_MODULES: EventModuleDefinition[] = [
  {
    module: "schedule",
    label: "スケジュール",
    events: [
      { name: "schedule.confirmed", label: "時間割確定" },
      { name: "schedule.changed", label: "授業予定変更" },
    ],
  },
  {
    module: "reservation",
    label: "予約",
    events: [
      { name: "reservation.created", label: "予約作成" },
      { name: "reservation.updated", label: "予約変更" },
      { name: "reservation.cancelled", label: "予約キャンセル" },
      { name: "reservation.reminder", label: "予約リマインド" },
    ],
  },
  {
    module: "calendar",
    label: "カレンダー",
    events: [
      { name: "sync.conflict", label: "予定競合" },
    ],
  },
  {
    module: "reminder",
    label: "リマインダー",
    events: [
      { name: "reminder.morning", label: "朝の未完了タスク通知" },
    ],
  },
];

/** Flat map: event name → Japanese label */
export const EVENT_LABELS: Record<string, string> = Object.fromEntries(
  EVENT_MODULES.flatMap((m) => m.events.map((e) => [e.name, e.label]))
);

/** Notification channels */
export const NOTIFICATION_CHANNELS = [
  "in_app",
  "email",
  "push",
  "webhook",
] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Notification platforms */
export const NOTIFICATION_PLATFORMS = [
  "generic",
  "slack",
  "discord",
  "line",
] as const;
export type NotificationPlatform = (typeof NOTIFICATION_PLATFORMS)[number];

/** Platform display labels */
export const PLATFORM_LABELS: Record<NotificationPlatform, string> = {
  generic: "汎用Webhook",
  slack: "Slack",
  discord: "Discord",
  line: "LINE",
};

/** Platform send methods */
export const SEND_METHODS = ["webhook", "bot"] as const;
export type SendMethod = (typeof SEND_METHODS)[number];

/** Send method display labels */
export const SEND_METHOD_LABELS: Record<SendMethod, string> = {
  webhook: "Webhook",
  bot: "Bot",
};

/** Webhook retry delays in ms */
export const WEBHOOK_RETRY_DELAYS = [
  10_000, // 10s
  30_000, // 30s
  120_000, // 2min
  600_000, // 10min
  3_600_000, // 1hr
] as const;

/** Max webhook consecutive failures before auto-disable */
export const WEBHOOK_MAX_FAILURES = 5;

/** M6: Voting answer values (○△×) */
export const VOTE_ANSWERS = ["ok", "maybe", "ng"] as const;
export type VoteAnswer = (typeof VOTE_ANSWERS)[number];

/** M6: Voting event statuses */
export const VOTING_STATUSES = ["open", "closed"] as const;
export type VotingStatus = (typeof VOTING_STATUSES)[number];

/** M6: Vote answer display labels */
export const VOTE_ANSWER_LABELS: Record<VoteAnswer, string> = {
  ok: "○",
  maybe: "△",
  ng: "×",
};
