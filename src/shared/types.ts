import type {
  SlotStatus,
  ReservationStatus,
  NotificationChannel,
  NotificationPlatform,
  SendMethod,
} from "./constants.js";

// ─── Auth Types ─────────────────────────────────────────────

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  major: string | null;
  calendarAccessId: string | null;
  hasGoogleAuth: boolean;
  hasPassword: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: { id: string; name: string; email: string; role: string };
  accessToken: string;
  refreshToken: string;
}

// ─── M1: Schedule Builder Types ──────────────────────────────

/** 学科 */
export interface Department {
  id: string;
  name: string;
}

/** 講師 */
export interface Instructor {
  id: string;
  name: string;
}

/** カリキュラム: 1つの学科 × 1人の講師 */
export interface Curriculum {
  id: string;
  name: string;
  /** 所属学科ID */
  departmentId: string;
  /** 担当講師ID (null = 未アサイン) */
  instructorId: string | null;
}

/** 出講可能スロット: 講師の曜日ごとの出講可能コマ */
export interface InstructorAvailableSlot {
  id: string;
  instructorId: string;
  /** 曜日 (0=月〜6=日) */
  day: number;
  /** 出講可能なコマ番号の配列 */
  periods: number[];
}

// ─── M2: Data Integration Types ──────────────────────────────

export interface UnifiedSlot {
  day: number;
  period: number;
  status: SlotStatus;
  majorLabel: string | null;
  isPrivate: boolean;
  sourceModule: string;
}

export interface MemberProfile {
  userId: string;
  name: string;
  major: string;
  slots: UnifiedSlot[][];
  attendanceDays: number[];
}

// ─── M3: Auto-Scheduler Types ────────────────────────────────

export interface Group {
  id: string;
  name: string;
  members: string[];
  createdBy: string;
  createdAt: Date;
}

export interface AvailabilitySlot {
  day: number;
  period: number;
  availableCount: number;
  totalMembers: number;
  isFullyAvailable: boolean;
  isPartiallyAvailable: boolean;
  availableRooms: string[];
}

export interface MeetingSuggestion {
  day: number;
  period: number;
  score: number;
  availableCount: number;
  totalMembers: number;
  availableRooms: string[];
  reasons: string[];
}

// ─── M4: Reservation Types ───────────────────────────────────

export interface Reservation {
  id: string;
  groupId: string;
  title: string;
  day: number;
  period: number;
  roomId: string;
  createdBy: string;
  participants: string[];
  status: ReservationStatus;
  createdAt: Date;
  note: string;
  version: number;
}

export interface CreateReservationInput {
  groupId: string;
  title: string;
  day: number;
  period: number;
  roomId: string;
  participants: string[];
  note?: string;
}

// ─── M5: Webhook & Notification Types ────────────────────────

export interface WebhookEndpoint {
  id: string;
  url: string;
  events: string[];
  secret: string;
  platform: NotificationPlatform;
  sendMethod: SendMethod;
  botToken: string | null;
  channelId: string | null;
  isActive: boolean;
  createdBy: string;
  failCount: number;
  lastDeliveredAt: Date | null;
}

export interface NotificationTemplate {
  id: string;
  event: string;
  platform: string;
  title: string;
  body: string;
  useCodeBlock: boolean;
  codeBlockLang: string | null;
  isDefault: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookPayload {
  event: string;
  timestamp: string;
  deliveryId: string;
  data: Record<string, unknown>;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  deliveryId: string;
  event: string;
  statusCode: number | null;
  success: boolean;
  retryCount: number;
  latencyMs: number;
  createdAt: Date;
}

export interface NotificationPreference {
  userId: string;
  channel: NotificationChannel;
  enabledEvents: string[];
  reminder: {
    dayBefore: boolean;
    dayBeforeTime: string;
    morningOf: boolean;
    morningOfTime: string;
    before: boolean;
    beforeMinutes: number;
  };
  quietHoursStart: string;
  quietHoursEnd: string;
}

export interface NotificationRecord {
  id: string;
  userId: string;
  event: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  isRead: boolean;
  createdAt: Date;
}

// ─── M6: Voting Types ────────────────────────────────────────

import type { VoteAnswer, VotingStatus } from "./constants.js";

export interface VotingEvent {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  deadline: string | null;
  status: VotingStatus;
  createdAt: Date;
  updatedAt: Date;
  candidates: VotingCandidate[];
}

export interface VotingCandidate {
  id: string;
  eventId: string;
  label: string;
  sortOrder: number;
}

export interface Vote {
  id: string;
  eventId: string;
  candidateId: string;
  userId: string;
  answer: VoteAnswer;
  isAutoReply: boolean;
  comment: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateVotingEventInput {
  title: string;
  description?: string;
  deadline?: string;
  candidates: string[];
}

export interface SubmitVotesInput {
  votes: { candidateId: string; answer: VoteAnswer; comment?: string }[];
}

export interface VotingSummary {
  event: VotingEvent;
  /** candidateId -> { ok, maybe, ng } counts */
  summary: Record<string, { ok: number; maybe: number; ng: number }>;
  /** userId -> { candidateId -> Vote } */
  responses: Record<string, Record<string, Vote>>;
  /** userId -> userName */
  respondents: Record<string, string>;
}

// ─── M3 MACHINA: Task Auto-Generation Types ────────────────

import type {
  MachinaTaskStatus,
  MachinaTaskPriority,
  MachinaTaskSource,
  MachinaMonitorPlatform,
  MachinaLogAction,
} from "./constants.js";

/** M3: チャンネル監視設定 */
export interface MachinaChannelMonitor {
  id: string;
  groupId: string;
  platform: MachinaMonitorPlatform;
  channelId: string;
  channelName: string;
  webhookEndpointId: string | null;
  isActive: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** M3: 自動生成タスク */
export interface MachinaTask {
  id: string;
  groupId: string;
  title: string;
  description: string | null;
  status: MachinaTaskStatus;
  priority: MachinaTaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  source: MachinaTaskSource;
  sourcePlatform: string | null;
  sourceMessageId: string | null;
  sourceChannelId: string | null;
  sourceText: string | null;
  confidence: number;
  isCriticalPath: boolean;
  relayedToPm: boolean;
  pmTaskId: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

/** M3: タスク変更ログ */
export interface MachinaTaskLog {
  id: string;
  taskId: string;
  action: MachinaLogAction;
  previousValue: string | null;
  newValue: string | null;
  reason: string | null;
  triggerMessageId: string | null;
  performedBy: string;
  createdAt: Date;
}

/** M3: メッセージ解析結果 */
export interface MachinaAnalysisResult {
  shouldCreateTask: boolean;
  title: string;
  description: string | null;
  priority: MachinaTaskPriority;
  assigneeHint: string | null;
  dueDateHint: string | null;
  confidence: number;
  reasoning: string;
}

/** M3: PM (M2) リレーインターフェース */
export interface MachinaPmRelay {
  /** PMモジュールにタスクを送信 */
  createTask(task: MachinaTask): Promise<{ pmTaskId: string }>;
  /** PMモジュールのタスクを更新 */
  updateTask(pmTaskId: string, updates: Partial<MachinaTask>): Promise<void>;
}

// ─── Core: Event (予定) ──────────────────────────────────────
// 時間拘束のある未来の事象。要件は持たない (例: MTG, 講義, 予約)。

export type EventVisibility = "private" | "group" | "public";

export interface CoreEvent {
  id: string;
  ownerId: string;
  groupId: string | null;
  title: string;
  description: string | null;
  startTime: Date;
  endTime: Date;
  isAllDay: boolean;
  location: string | null;
  visibility: EventVisibility;
  /** 生成元プラグイン ID (例: "calendar", "voting", "facility-booking") */
  pluginId: string | null;
  pluginRef: string | null;
  pluginPayload: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  startTime: string | Date;
  endTime: string | Date;
  isAllDay?: boolean;
  location?: string;
  groupId?: string;
  visibility?: EventVisibility;
  pluginId?: string;
  pluginRef?: string;
  pluginPayload?: Record<string, unknown>;
}

/** Event プラグイン: Schedula コアの「予定」を生成・拡張するモジュール */
export interface EventPlugin {
  /** プラグイン識別子 (例: "calendar", "voting") */
  id: string;
  /** 表示名 */
  name: string;
  /** 説明 */
  description: string;
  /** Lucide icon 名 (任意) */
  icon?: string;
  /** バックエンド API ベースパス (任意) */
  apiBasePath?: string;
  /** フロントエンドルートパス (任意) */
  frontendPath?: string;
  /** プラグインが events テーブルに直接書き込むか、独自管理か */
  managed: "core" | "external";
}

// ─── Core: Task (タスク) ─────────────────────────────────────
// 解決すべき現在の事象。要件を持つが時間拘束はない。
// deadline (期限) を持つことができる。

export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "medium" | "high" | "critical";

export interface CoreTask {
  id: string;
  ownerId: string;
  assigneeId: string | null;
  groupId: string | null;
  title: string;
  description: string | null;
  requirements: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  deadline: Date | null;
  estimatedMinutes: number | null;
  pluginId: string | null;
  pluginRef: string | null;
  pluginPayload: Record<string, unknown> | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  requirements?: string;
  assigneeId?: string;
  groupId?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  deadline?: string | Date;
  estimatedMinutes?: number;
  pluginId?: string;
  pluginRef?: string;
  pluginPayload?: Record<string, unknown>;
}

/** Task プラグイン: Schedula コアの「タスク」を生成・拡張するモジュール */
export interface TaskPlugin {
  id: string;
  name: string;
  description: string;
  icon?: string;
  apiBasePath?: string;
  frontendPath?: string;
  managed: "core" | "external";
}

// ─── Reservation Plugin System ──────────────────────────────

/** 予約プラグインが出力する共通カレンダー予定スキーマ */
export interface ReservationCalendarEvent {
  /** 予約者ユーザID */
  reservedBy: string;
  /** カレンダー予定ID (personalEvent.id) */
  calendarEventId: string;
  /** 開始日時 (ISO 8601) */
  startTime: string;
  /** 終了日時 (ISO 8601) */
  endTime: string;
  /** 予定名 */
  title: string;
  /** グループID (nullable) */
  groupId: string | null;
  /** 概要・備考 */
  description: string;
}

/** 予約プラグインインターフェース */
export interface ReservationPlugin {
  /** プラグイン識別子 (例: "facility", "voting") */
  id: string;
  /** 表示名 (例: "施設予約", "日程調整") */
  name: string;
  /** 説明 */
  description: string;
  /** アイコン名 (Lucide icon) */
  icon: string;
  /** バックエンド API ベースパス */
  apiBasePath: string;
  /** フロントエンドルートパス */
  frontendPath: string;
  /** 共通 CRUD 操作のエンドポイントパス (apiBasePath からの相対) */
  operations: {
    /** 予約一覧取得: GET */
    list: string;
    /** 予約作成: POST */
    create: string;
    /** 予約キャンセル: DELETE /:id */
    cancel: string;
  };
}

// ─── Module System ──────────────────────────────────────────

import type { Hono } from "hono";

/** Schedula モジュールインターフェース */
export interface SchulaModule {
  /** モジュール識別子 */
  name: string;
  /** 人間向け説明 */
  description: string;
  /** このモジュールが提供する Hono ルーター */
  routes: Hono;
  /** マウントされる API パスプレフィックス */
  basePath: string;
  /** サブモジュール一覧 (情報用) */
  submodules: { id: string; name: string; path: string }[];
}
