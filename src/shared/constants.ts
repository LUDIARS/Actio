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
  // PM モジュール
  PM_TASK_CREATED: "pm.task.created",
  PM_TASK_UPDATED: "pm.task.updated",
  PM_TASK_CLOSED: "pm.task.closed",
  PM_TASK_REOPENED: "pm.task.reopened",
  PM_TASK_ASSIGNED: "pm.task.assigned",
  PM_DEADLINE_WARNING: "pm.deadline.warning",
  PM_DEADLINE_OVERDUE: "pm.deadline.overdue",
  PM_REPORT_READY: "pm.report.ready",
  PM_SYNC_CONFLICT: "pm.sync.conflict",
  PM_SYNC_AUTO_MERGED: "pm.sync.auto_merged",
  PM_SYNC_FORCE_EXTERNAL: "pm.sync.force_external",
  PM_WRITEBACK_SUCCESS: "pm.writeback.success",
  PM_WRITEBACK_FAILED: "pm.writeback.failed",
  // MACHINA モジュール
  MACHINA_TASK_CREATED: "machina.task.created",
  MACHINA_TASK_UPDATED: "machina.task.updated",
  MACHINA_TASK_COMPLETED: "machina.task.completed",
  MACHINA_TASK_ASSIGNED: "machina.task.assigned",
  MACHINA_TASK_RELAYED: "machina.task.relayed",
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
    module: "pm",
    label: "プロジェクト管理",
    events: [
      { name: "pm.task.created", label: "タスク新規作成" },
      { name: "pm.task.updated", label: "タスク更新" },
      { name: "pm.task.closed", label: "タスク完了" },
      { name: "pm.task.reopened", label: "タスク再オープン" },
      { name: "pm.task.assigned", label: "担当者変更" },
      { name: "pm.deadline.warning", label: "納期警告" },
      { name: "pm.deadline.overdue", label: "納期超過" },
      { name: "pm.report.ready", label: "分析レポート生成" },
      { name: "pm.sync.conflict", label: "同期コンフリクト" },
      { name: "pm.sync.auto_merged", label: "自動マージ完了" },
      { name: "pm.sync.force_external", label: "外部優先上書き" },
      { name: "pm.writeback.success", label: "外部書き戻し成功" },
      { name: "pm.writeback.failed", label: "外部書き戻し失敗" },
    ],
  },
  {
    module: "machina",
    label: "M3 MACHINA",
    events: [
      { name: "machina.task.created", label: "タスク自動生成" },
      { name: "machina.task.updated", label: "タスク自動更新" },
      { name: "machina.task.completed", label: "タスク自動完了" },
      { name: "machina.task.assigned", label: "アサイン自動変更" },
      { name: "machina.task.relayed", label: "PM (M2) リレー" },
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

// ─── M3 MACHINA: Task Auto-Generation ─────────────────────────

/** M3: MACHINA task statuses */
export const MACHINA_TASK_STATUSES = [
  "pending",
  "in_progress",
  "done",
  "cancelled",
] as const;
export type MachinaTaskStatus = (typeof MACHINA_TASK_STATUSES)[number];

/** M3: MACHINA task status labels */
export const MACHINA_TASK_STATUS_LABELS: Record<MachinaTaskStatus, string> = {
  pending: "未着手",
  in_progress: "進行中",
  done: "完了",
  cancelled: "キャンセル",
};

/** M3: MACHINA task priorities */
export const MACHINA_TASK_PRIORITIES = [
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type MachinaTaskPriority = (typeof MACHINA_TASK_PRIORITIES)[number];

/** M3: MACHINA task priority labels */
export const MACHINA_TASK_PRIORITY_LABELS: Record<MachinaTaskPriority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  critical: "緊急",
};

/** M3: MACHINA task sources */
export const MACHINA_TASK_SOURCES = [
  "auto",
  "command",
  "manual",
] as const;
export type MachinaTaskSource = (typeof MACHINA_TASK_SOURCES)[number];

/** M3: MACHINA monitor platforms */
export const MACHINA_MONITOR_PLATFORMS = [
  "slack",
  "discord",
] as const;
export type MachinaMonitorPlatform = (typeof MACHINA_MONITOR_PLATFORMS)[number];

/** M3: Keywords that indicate task completion / assignment changes */
export const MACHINA_COMPLETION_KEYWORDS = [
  "完了", "done", "修正した", "push", "マージ", "merge", "デプロイ", "deploy",
  "クローズ", "close", "finished", "対応済み", "resolved",
] as const;

/** M3: Keywords that indicate high urgency */
export const MACHINA_URGENCY_KEYWORDS = [
  "急ぎ", "至急", "ASAP", "urgent", "緊急", "今日中", "すぐ",
  "ブロッカー", "blocker", "critical", "障害",
] as const;

// ─── Actio Module Definitions ────────────────────────────────

/** Selectable module IDs (グループごとに有効/無効を切り替え可能) */
export const ACTIO_MODULES = [
  "calicula",
  "pm",
  "machina",
  "notification",
  "voting",
  "holiday",
  "facility-booking",
  "integrations",
] as const;
export type ActioModuleId = (typeof ACTIO_MODULES)[number];

/** Module metadata for UI display */
export interface ActioModuleInfo {
  id: ActioModuleId;
  name: string;
  codename: string | null;
  description: string;
  icon: string;
  category: "education" | "project" | "communication" | "utility";
}

/** All selectable modules with metadata */
export const ACTIO_MODULE_INFO: ActioModuleInfo[] = [
  {
    id: "calicula",
    name: "CALICULA",
    codename: "M1",
    description: "学校カリキュラム管理 — 学科・講師・カリキュラムの CRUD、スケジュール配置",
    icon: "GraduationCap",
    category: "education",
  },
  {
    id: "pm",
    name: "PM",
    codename: "M2",
    description: "プロジェクト管理 — GitHub/Notion タスク同期・分析・リマインダー",
    icon: "KanbanSquare",
    category: "project",
  },
  {
    id: "machina",
    name: "MACHINA",
    codename: "M3",
    description: "タスク自動生成 — Slack/Discord チャンネル監視 & AI タスク生成",
    icon: "Bot",
    category: "project",
  },
  {
    id: "notification",
    name: "通知・Webhook",
    codename: null,
    description: "Slack/Discord/LINE/Webhook 通知配信",
    icon: "Bell",
    category: "communication",
  },
  {
    id: "voting",
    name: "日程調整Voting",
    codename: null,
    description: "投票による日程調整 (○△×)",
    icon: "CalendarCheck",
    category: "communication",
  },
  {
    id: "holiday",
    name: "休日管理",
    codename: null,
    description: "日本の祝日自動取得・グループ固有の休日・審査会期間管理",
    icon: "CalendarOff",
    category: "utility",
  },
  {
    id: "facility-booking",
    name: "施設予約",
    codename: null,
    description: "教室・会議室の予約管理 (CALICULA サブモジュール)",
    icon: "Building2",
    category: "education",
  },
  {
    id: "integrations",
    name: "外部サービス連携",
    codename: null,
    description: "Google Calendar 同期・Notion 連携",
    icon: "Plug",
    category: "utility",
  },
];

/** Core modules (always enabled, not selectable) */
export const CORE_MODULES = [
  "auth",
  "groups",
  "calendar",
  "myplan",
  "smart-scheduler",
  "profile",
] as const;

/** Default enabled modules for new groups */
export const DEFAULT_ENABLED_MODULES: ActioModuleId[] = [
  "holiday",
  "voting",
  "notification",
];

/** M3: MACHINA task log actions */
export const MACHINA_LOG_ACTIONS = [
  "created",
  "updated",
  "assigned",
  "status_changed",
  "priority_changed",
  "relayed",
] as const;
export type MachinaLogAction = (typeof MACHINA_LOG_ACTIONS)[number];
