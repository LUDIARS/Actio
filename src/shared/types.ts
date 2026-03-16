import type {
  SlotStatus,
  ReservationStatus,
  RoomType,
  ScheduleMode,
  NotificationChannel,
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

export interface Instructor {
  id: string;
  name: string;
  major: string;
  courses: string[];
  /** 7 days × 11 periods: true = available */
  availability: boolean[][];
  /** 出講可能条件の種別 */
  availabilityConditionType: "any" | "weekly_limit" | "period_only" | "unavailable";
  /** 出講可能条件の詳細 */
  availabilityCondition: Record<string, unknown>;
}

/** 出講条件: 週N日まで */
export interface WeeklyLimitCondition {
  maxDaysPerWeek: number;
}

/** 出講条件: 特定期間のみ */
export interface PeriodOnlyCondition {
  startDate: string;
  endDate: string;
}

export interface Curriculum {
  id: string;
  /** 学科名 */
  departmentName: string;
  /** カリキュラム名 */
  name: string;
  /** 担当講師ID */
  instructorId: string;
  /** 1回あたりのコマ数 */
  slotsPerSession: number;
  /** 開催回数 */
  totalSessions: number;
  /** 教室タイプ */
  roomType: RoomType;
  /** 割り当て済み教室ID */
  roomId: string | null;
  /** 編集期限 */
  editableUntil: Date;
  /** 学期ID */
  termId: string;
}

export interface Room {
  id: string;
  name: string;
  capacity: number;
  type: RoomType;
  equipment: string[];
}

export interface ScheduleEntry {
  day: number;
  period: number;
  curriculumId: string;
  roomId: string;
  instructorId: string;
  candidateCount: number;
}

export interface SwapRequest {
  fromDay: number;
  fromPeriod: number;
  toDay: number;
  toPeriod: number;
  transactionId: string;
}

export interface SwapCandidate {
  day: number;
  period: number;
  candidateCount: number;
  color: string;
}

// ─── Curriculum Plan Types (パズルUI用) ─────────────────────

/** カリキュラムプラン: スケジュール繰り返しの設計 */
export interface CurriculumPlan {
  id: string;
  curriculumId: string;
  name: string;
  termId: string;
  status: "draft" | "confirmed" | "archived";
}

/**
 * プランブロック: パズルUIの個別ブロック
 * - 画面下に未配置ブロックを表示
 * - カレンダー枠にドラッグして配置
 * - ブロックは吸着する
 * - 予定が組めない場合は欄外にerror配置
 */
export interface PlanBlock {
  id: string;
  planId: string;
  curriculumId: string;
  /** 第N回 */
  sessionNumber: number;
  /** 配置状態 */
  placementStatus: "placed" | "unplaced" | "error";
  /** 配置先曜日 (0-6) */
  day: number | null;
  /** 配置先開始コマ (0-10) */
  period: number | null;
  /** ブロック幅 (コマ数) */
  blockSize: number;
  /** エラーメッセージ */
  errorMessage: string | null;
  /** 表示色 */
  color: string | null;
  /** ソート順 */
  sortOrder: number;
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
  isActive: boolean;
  createdBy: string;
  failCount: number;
  lastDeliveredAt: Date | null;
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

// ─── Scheduling Algorithm Types ──────────────────────────────

export interface ScheduleGenerationRequest {
  mode: ScheduleMode;
}

export interface ScheduleGenerationResult {
  entries: ScheduleEntry[];
  unplaced: string[];
  stats: {
    totalCurricula: number;
    placed: number;
    unplaced: number;
    mode: ScheduleMode;
  };
}
