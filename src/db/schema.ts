import { sqliteTable, text, integer, unique, index } from "drizzle-orm/sqlite-core";

// ─── Users (認証 + カレンダーアクセス) ──────────────────────
// メインDBのユーザテーブル: パスワード認証 / Google OAuth両対応

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("student"),
  major: text("major"),

  // パスワード認証用 (bcryptハッシュ)
  passwordHash: text("password_hash"),

  // Google OAuth用
  googleId: text("google_id").unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: integer("google_token_expires_at"),

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

// ─── M3: Groups ─────────────────────────────────────────────

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** JSON array of member user IDs */
  members: text("members", { mode: "json" }).$type<string[]>().notNull().default([]),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

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
