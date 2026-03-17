import { sqliteTable, text, integer, unique, index } from "drizzle-orm/sqlite-core";

// ─── Users (認証 + カレンダーアクセス) ──────────────────────
// メインDBのユーザテーブル: パスワード認証 / Google OAuth両対応

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("general"),
  major: text("major"),

  // パスワード認証用 (bcryptハッシュ)
  passwordHash: text("password_hash"),

  // Google OAuth用
  googleId: text("google_id").unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: integer("google_token_expires_at"),

  // Google認可スコープ（許可されたパーミッション一覧）
  googleScopes: text("google_scopes", { mode: "json" }).$type<string[]>(),

  // Google Calendar連携用
  calendarAccessId: text("calendar_access_id"),

  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Sessions (JWT管理用) ──────────────────────────────────

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  refreshToken: text("refresh_token").notNull().unique(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── M1: Rooms ──────────────────────────────────────────────

export const rooms = sqliteTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  type: text("type").notNull(),
  /** JSON array of equipment strings */
  equipment: text("equipment", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── M1: Schedule Entries (実スケジュール) ───────────────────
// カリキュラムの「プラン」から確定された実際のスケジュール

export const scheduleEntries = sqliteTable(
  "schedule_entries",
  {
    id: text("id").primaryKey(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    curriculumId: text("curriculum_id").notNull(),
    roomId: text("room_id").references(() => rooms.id),
    instructorId: text("instructor_id").notNull(),
    candidateCount: integer("candidate_count").notNull().default(0),
    isConfirmed: integer("is_confirmed", { mode: "boolean" }).notNull().default(false),
    termId: text("term_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_slot_per_room").on(table.day, table.period, table.roomId, table.termId),
    index("idx_schedule_term").on(table.termId),
    index("idx_schedule_instructor").on(table.instructorId),
  ]
);

// ─── M2: Unified Slots (cached) ────────────────────────────

export const unifiedSlots = sqliteTable(
  "unified_slots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    status: text("status").notNull().default("free"),
    majorLabel: text("major_label"),
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(false),
    sourceModule: text("source_module").notNull(),
    cachedAt: integer("cached_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_unified_user").on(table.userId),
    unique("unique_user_slot").on(table.userId, table.day, table.period, table.sourceModule),
  ]
);

// ─── M2: Member Profiles ────────────────────────────────────

export const memberProfiles = sqliteTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  major: text("major").notNull(),
  /** JSON array of day numbers */
  attendanceDays: text("attendance_days", { mode: "json" }).$type<number[]>().notNull().default([]),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Groups ─────────────────────────────────────────────────

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  /** JSON array of member user IDs (legacy, kept for backward compat) */
  members: text("members", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Group Members (多対多: ユーザーは複数グループに所属可) ─────

export const groupMembers = sqliteTable(
  "group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull().default("member"), // owner / admin / member
    joinedAt: integer("joined_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_group_member").on(table.groupId, table.userId),
    index("idx_group_member_user").on(table.userId),
    index("idx_group_member_group").on(table.groupId),
  ]
);

// ─── Group Schedules (グループ固有の予定) ────────────────────
// グループの予定は削除不可（個人の予定のみ個別に追加・削除可能）

export const groupSchedules = sqliteTable(
  "group_schedules",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    title: text("title").notNull(),
    description: text("description"),
    day: integer("day").notNull(), // 0-6
    period: integer("period").notNull(), // 0-10
    duration: integer("duration").notNull().default(1),
    /** 特定日付の予定の場合 (YYYY-MM-DD) */
    date: text("date"),
    /** recurring = 毎週繰り返し, oneshot = 特定日のみ */
    scheduleType: text("schedule_type").notNull().default("recurring"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_group_schedule_group").on(table.groupId),
    index("idx_group_schedule_date").on(table.date),
  ]
);

// ─── M4: Reservations ───────────────────────────────────────

export const reservations = sqliteTable(
  "reservations",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    title: text("title").notNull(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    roomId: text("room_id")
      .references(() => rooms.id)
      .notNull(),
    createdBy: text("created_by").notNull(),
    /** JSON array of participant user IDs */
    participants: text("participants", { mode: "json" }).$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("pending"),
    note: text("note").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_reservation_room_slot").on(table.roomId, table.day, table.period),
    index("idx_reservation_group").on(table.groupId),
  ]
);

// ─── Personal Events (手動予定) ─────────────────────────────
// Google認証なしでも手動で予定を追加可能

export const personalEvents = sqliteTable(
  "personal_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    title: text("title").notNull(),
    description: text("description"),
    day: integer("day").notNull(), // 0-6 (月〜日)
    period: integer("period").notNull(), // 0-10
    /** 複数コマにまたがる場合のコマ数 */
    duration: integer("duration").notNull().default(1),
    /** イベント種別: personal / school_event */
    eventType: text("event_type").notNull().default("personal"),
    /** 繰り返し元のプランID (プランから自動生成された場合) */
    planId: text("plan_id"),
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_personal_event_user").on(table.userId),
    index("idx_personal_event_plan").on(table.planId),
    unique("unique_personal_slot").on(table.userId, table.day, table.period),
  ]
);

// ─── Plans (プラン: 繰り返し予定の自動生成) ──────────────────
// プランを設定すると対応する personalEvents が自動生成される

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    /** 繰り返し対象の曜日 JSON array [0,1,2,...] (0=月) */
    days: text("days", { mode: "json" }).$type<number[]>().notNull().default([]),
    /** 開始コマ (0-10) */
    startPeriod: integer("start_period").notNull(),
    /** コマ数 */
    duration: integer("duration").notNull().default(1),
    /** イベント種別 */
    eventType: text("event_type").notNull().default("personal"),
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(true),
    /** プラン有効/無効 */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_plan_user").on(table.userId),
  ]
);

// ─── My Plans (マイプラン: 週間ルーティーン) ──────────────────
// 基本パターンと特別パターンを持ち、特別パターンが優先される
// マイプランを設定すると今後の予定が自動的に生成される

export const myPlans = sqliteTable(
  "my_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    /** グループ用マイプランの場合 */
    groupId: text("group_id"),
    name: text("name").notNull(),
    /** basic = 基本パターン, special = 特別パターン（優先） */
    patternType: text("pattern_type").notNull().default("basic"),
    /** 適用開始日 (YYYY-MM-DD) */
    validFrom: text("valid_from"),
    /** 適用終了日 (YYYY-MM-DD)、nullなら無期限 */
    validUntil: text("valid_until"),
    /** 週間スケジュール: JSON { "0": [{ period, duration, title }], ... } */
    weeklySchedule: text("weekly_schedule", { mode: "json" }).$type<
      Record<string, Array<{ period: number; duration: number; title: string }>>
    >().notNull().default({}),
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /** 優先度（同一期間に複数パターンがある場合の優先順位、大きいほど優先） */
    priority: integer("priority").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_myplan_user").on(table.userId),
    index("idx_myplan_group").on(table.groupId),
  ]
);

// ─── M5: Webhook Endpoints ──────────────────────────────────

export const webhookEndpoints = sqliteTable("webhook_endpoints", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  /** JSON array of event names */
  events: text("events", { mode: "json" }).$type<string[]>().notNull().default([]),
  secret: text("secret").notNull(),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull(),
  failCount: integer("fail_count").notNull().default(0),
  lastDeliveredAt: integer("last_delivered_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── M5: Webhook Delivery Logs ──────────────────────────────

export const webhookDeliveryLogs = sqliteTable(
  "webhook_delivery_logs",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .references(() => webhookEndpoints.id)
      .notNull(),
    deliveryId: text("delivery_id").notNull(),
    event: text("event").notNull(),
    statusCode: integer("status_code"),
    success: integer("success", { mode: "boolean" }).notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_delivery_webhook").on(table.webhookId)]
);

// ─── M6: Voting Events (日程調整) ──────────────────────────

export const votingEvents = sqliteTable("voting_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  createdBy: text("created_by")
    .references(() => users.id)
    .notNull(),
  /** 回答期限 (ISO 8601) */
  deadline: text("deadline"),
  /** open / closed */
  status: text("status").notNull().default("open"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── M6: Voting Candidates (候補日時) ────────────────────────

export const votingCandidates = sqliteTable(
  "voting_candidates",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .references(() => votingEvents.id)
      .notNull(),
    /** 候補ラベル (例: "3/20(木) 10:00〜11:00") */
    label: text("label").notNull(),
    /** ソート用 */
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_candidate_event").on(table.eventId),
  ]
);

// ─── M6: Votes (回答) ───────────────────────────────────────

export const votes = sqliteTable(
  "votes",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .references(() => votingEvents.id)
      .notNull(),
    candidateId: text("candidate_id")
      .references(() => votingCandidates.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    /** ok=○, maybe=△, ng=× */
    answer: text("answer").notNull(),
    /** 自動回答かどうか */
    isAutoReply: integer("is_auto_reply", { mode: "boolean" }).notNull().default(false),
    comment: text("comment").notNull().default(""),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_vote_per_user_candidate").on(table.eventId, table.candidateId, table.userId),
    index("idx_vote_event").on(table.eventId),
    index("idx_vote_user").on(table.userId),
  ]
);

// ─── M5: Notification Preferences ───────────────────────────

export const notificationPreferences = sqliteTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    channel: text("channel").notNull(),
    /** JSON array of enabled event names */
    enabledEvents: text("enabled_events", { mode: "json" }).$type<string[]>().notNull().default([]),
    reminderDayBefore: integer("reminder_day_before", { mode: "boolean" }).notNull().default(true),
    reminderDayBeforeTime: text("reminder_day_before_time").notNull().default("18:00"),
    reminderMorningOf: integer("reminder_morning_of", { mode: "boolean" }).notNull().default(true),
    reminderMorningOfTime: text("reminder_morning_of_time").notNull().default("08:00"),
    reminderBefore: integer("reminder_before", { mode: "boolean" }).notNull().default(true),
    reminderBeforeMinutes: integer("reminder_before_minutes").notNull().default(15),
    quietHoursStart: text("quiet_hours_start").notNull().default("22:00"),
    quietHoursEnd: text("quiet_hours_end").notNull().default("07:00"),
  },
  (table) => [
    unique("unique_user_channel").on(table.userId, table.channel),
  ]
);

// ─── M5: Notifications ──────────────────────────────────────

export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    event: text("event").notNull(),
    channel: text("channel").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    isRead: integer("is_read", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_notification_user").on(table.userId),
  ]
);
