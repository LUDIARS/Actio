import type {
  SlotStatus,
  ReservationStatus,
  RoomType,
  ScheduleMode,
  NotificationChannel,
} from "./constants.js";

// ─── M1: Schedule Builder Types ──────────────────────────────

export interface Instructor {
  id: string;
  name: string;
  major: string;
  courses: string[];
  /** 7 days × 11 periods: true = available */
  availability: boolean[][];
}

export interface Curriculum {
  id: string;
  name: string;
  major: string;
  instructorId: string;
  weeklySlots: number;
  roomType: RoomType;
  editableUntil: Date;
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
