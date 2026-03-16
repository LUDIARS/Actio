import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  varchar,
  index,
  unique,
} from "drizzle-orm/pg-core";

// ─── M1: Instructors ────────────────────────────────────────

export const instructors = pgTable("instructors", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  major: text("major").notNull(),
  courses: jsonb("courses").$type<string[]>().notNull().default([]),
  /** 7×11 boolean matrix: availability[day][period] */
  availability: jsonb("availability").$type<boolean[][]>().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── M1: Curricula ──────────────────────────────────────────

export const curricula = pgTable("curricula", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  major: text("major").notNull(),
  instructorId: uuid("instructor_id")
    .references(() => instructors.id)
    .notNull(),
  weeklySlots: integer("weekly_slots").notNull(),
  roomType: text("room_type").notNull(),
  editableUntil: timestamp("editable_until").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── M1: Rooms ──────────────────────────────────────────────

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  type: text("type").notNull(),
  equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── M1: Schedule Entries ───────────────────────────────────

export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    curriculumId: uuid("curriculum_id")
      .references(() => curricula.id)
      .notNull(),
    roomId: uuid("room_id")
      .references(() => rooms.id)
      .notNull(),
    instructorId: uuid("instructor_id")
      .references(() => instructors.id)
      .notNull(),
    candidateCount: integer("candidate_count").notNull().default(0),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    termId: text("term_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    unique("unique_slot_per_room").on(table.day, table.period, table.roomId, table.termId),
    index("idx_schedule_term").on(table.termId),
    index("idx_schedule_instructor").on(table.instructorId),
  ]
);

// ─── M2: Unified Slots (cached) ────────────────────────────

export const unifiedSlots = pgTable(
  "unified_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    status: text("status").notNull().default("free"),
    majorLabel: text("major_label"),
    isPrivate: boolean("is_private").notNull().default(false),
    sourceModule: text("source_module").notNull(),
    cachedAt: timestamp("cached_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_unified_user").on(table.userId),
    unique("unique_user_slot").on(table.userId, table.day, table.period, table.sourceModule),
  ]
);

// ─── M2: Member Profiles ────────────────────────────────────

export const memberProfiles = pgTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  major: text("major").notNull(),
  attendanceDays: jsonb("attendance_days").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── M3: Groups ─────────────────────────────────────────────

export const groups = pgTable("groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  members: jsonb("members").$type<string[]>().notNull().default([]),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── M4: Reservations ───────────────────────────────────────

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .references(() => groups.id)
      .notNull(),
    title: text("title").notNull(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    roomId: uuid("room_id")
      .references(() => rooms.id)
      .notNull(),
    createdBy: text("created_by").notNull(),
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("pending"),
    note: text("note").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_reservation_room_slot").on(table.roomId, table.day, table.period),
    index("idx_reservation_group").on(table.groupId),
  ]
);

// ─── M5: Webhook Endpoints ──────────────────────────────────

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  secret: text("secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull(),
  failCount: integer("fail_count").notNull().default(0),
  lastDeliveredAt: timestamp("last_delivered_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── M5: Webhook Delivery Logs ──────────────────────────────

export const webhookDeliveryLogs = pgTable(
  "webhook_delivery_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    webhookId: uuid("webhook_id")
      .references(() => webhookEndpoints.id)
      .notNull(),
    deliveryId: text("delivery_id").notNull(),
    event: text("event").notNull(),
    statusCode: integer("status_code"),
    success: boolean("success").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("idx_delivery_webhook").on(table.webhookId)]
);

// ─── M5: Notification Preferences ───────────────────────────

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    channel: text("channel").notNull(),
    enabledEvents: jsonb("enabled_events").$type<string[]>().notNull().default([]),
    reminderDayBefore: boolean("reminder_day_before").notNull().default(true),
    reminderDayBeforeTime: varchar("reminder_day_before_time", { length: 5 })
      .notNull()
      .default("18:00"),
    reminderMorningOf: boolean("reminder_morning_of").notNull().default(true),
    reminderMorningOfTime: varchar("reminder_morning_of_time", { length: 5 })
      .notNull()
      .default("08:00"),
    reminderBefore: boolean("reminder_before").notNull().default(true),
    reminderBeforeMinutes: integer("reminder_before_minutes").notNull().default(15),
    quietHoursStart: varchar("quiet_hours_start", { length: 5 })
      .notNull()
      .default("22:00"),
    quietHoursEnd: varchar("quiet_hours_end", { length: 5 })
      .notNull()
      .default("07:00"),
  },
  (table) => [
    unique("unique_user_channel").on(table.userId, table.channel),
  ]
);

// ─── M5: Notifications ──────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    event: text("event").notNull(),
    channel: text("channel").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("idx_notification_user").on(table.userId),
  ]
);

// ─── Users (simplified auth) ────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull().default("student"),
  major: text("major"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
