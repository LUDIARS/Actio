import type {
  SlotStatus,
  ReservationStatus,
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
