import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

// ─── Users ───────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("student"),
  major: text("major"),

  passwordHash: text("password_hash"),

  googleId: text("google_id").unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: integer("google_token_expires_at"),

  calendarAccessId: text("calendar_access_id"),

  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Sessions ────────────────────────────────────────────────

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull(),
  refreshToken: text("refresh_token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Rooms ───────────────────────────────────────────────────

export const rooms = pgTable("rooms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  type: text("type").notNull(),
  equipment: jsonb("equipment").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Schedule Entries ────────────────────────────────────────

export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: text("id").primaryKey(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    curriculumId: text("curriculum_id").notNull(),
    roomId: text("room_id").references(() => rooms.id),
    instructorId: text("instructor_id").notNull(),
    candidateCount: integer("candidate_count").notNull().default(0),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    termId: text("term_id").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_slot_per_room").on(table.day, table.period, table.roomId, table.termId),
    index("idx_schedule_term").on(table.termId),
    index("idx_schedule_instructor").on(table.instructorId),
  ]
);

// ─── Unified Slots ───────────────────────────────────────────

export const unifiedSlots = pgTable(
  "unified_slots",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    status: text("status").notNull().default("free"),
    majorLabel: text("major_label"),
    isPrivate: boolean("is_private").notNull().default(false),
    sourceModule: text("source_module").notNull(),
    cachedAt: timestamp("cached_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_unified_user").on(table.userId),
    unique("unique_user_slot").on(table.userId, table.day, table.period, table.sourceModule),
  ]
);

// ─── Member Profiles ─────────────────────────────────────────

export const memberProfiles = pgTable("member_profiles", {
  userId: text("user_id").primaryKey(),
  name: text("name").notNull(),
  major: text("major").notNull(),
  attendanceDays: jsonb("attendance_days").$type<number[]>().notNull().default([]),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Groups ──────────────────────────────────────────────────

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  members: jsonb("members").$type<string[]>().notNull().default([]),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Reservations ────────────────────────────────────────────

export const reservations = pgTable(
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
    participants: jsonb("participants").$type<string[]>().notNull().default([]),
    status: text("status").notNull().default("pending"),
    note: text("note").notNull().default(""),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_reservation_room_slot").on(table.roomId, table.day, table.period),
    index("idx_reservation_group").on(table.groupId),
  ]
);

// ─── Webhook Endpoints ───────────────────────────────────────

export const webhookEndpoints = pgTable("webhook_endpoints", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  secret: text("secret").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull(),
  failCount: integer("fail_count").notNull().default(0),
  lastDeliveredAt: timestamp("last_delivered_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Webhook Delivery Logs ───────────────────────────────────

export const webhookDeliveryLogs = pgTable(
  "webhook_delivery_logs",
  {
    id: text("id").primaryKey(),
    webhookId: text("webhook_id")
      .references(() => webhookEndpoints.id)
      .notNull(),
    deliveryId: text("delivery_id").notNull(),
    event: text("event").notNull(),
    statusCode: integer("status_code"),
    success: boolean("success").notNull(),
    retryCount: integer("retry_count").notNull().default(0),
    latencyMs: integer("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_delivery_webhook").on(table.webhookId)]
);

// ─── Notification Preferences ────────────────────────────────

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    channel: text("channel").notNull(),
    enabledEvents: jsonb("enabled_events").$type<string[]>().notNull().default([]),
    reminderDayBefore: boolean("reminder_day_before").notNull().default(true),
    reminderDayBeforeTime: text("reminder_day_before_time").notNull().default("18:00"),
    reminderMorningOf: boolean("reminder_morning_of").notNull().default(true),
    reminderMorningOfTime: text("reminder_morning_of_time").notNull().default("08:00"),
    reminderBefore: boolean("reminder_before").notNull().default(true),
    reminderBeforeMinutes: integer("reminder_before_minutes").notNull().default(15),
    quietHoursStart: text("quiet_hours_start").notNull().default("22:00"),
    quietHoursEnd: text("quiet_hours_end").notNull().default("07:00"),
  },
  (table) => [
    unique("unique_user_channel").on(table.userId, table.channel),
  ]
);

// ─── Notifications ───────────────────────────────────────────

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    event: text("event").notNull(),
    channel: text("channel").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_notification_user").on(table.userId),
  ]
);

// ─── Instructors ─────────────────────────────────────────────

export const instructors = pgTable("instructors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  major: text("major").notNull(),
  courses: jsonb("courses").$type<string[]>().notNull().default([]),
  availability: jsonb("availability").$type<boolean[][]>().notNull(),
  availabilityConditionType: text("availability_condition_type").notNull().default("any"),
  availabilityCondition: jsonb("availability_condition")
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Curricula ───────────────────────────────────────────────

export const curricula = pgTable("curricula", {
  id: text("id").primaryKey(),
  departmentName: text("department_name").notNull(),
  name: text("name").notNull(),
  instructorId: text("instructor_id")
    .references(() => instructors.id)
    .notNull(),
  slotsPerSession: integer("slots_per_session").notNull().default(1),
  totalSessions: integer("total_sessions").notNull(),
  roomType: text("room_type").notNull(),
  roomId: text("room_id"),
  editableUntil: timestamp("editable_until").notNull(),
  termId: text("term_id").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Curriculum Plans ────────────────────────────────────────

export const curriculumPlans = pgTable("curriculum_plans", {
  id: text("id").primaryKey(),
  curriculumId: text("curriculum_id")
    .references(() => curricula.id)
    .notNull(),
  name: text("name").notNull(),
  termId: text("term_id").notNull(),
  status: text("status").notNull().default("draft"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Plan Blocks ─────────────────────────────────────────────

export const planBlocks = pgTable(
  "plan_blocks",
  {
    id: text("id").primaryKey(),
    planId: text("plan_id")
      .references(() => curriculumPlans.id)
      .notNull(),
    curriculumId: text("curriculum_id")
      .references(() => curricula.id)
      .notNull(),
    sessionNumber: integer("session_number").notNull(),
    placementStatus: text("placement_status").notNull().default("unplaced"),
    day: integer("day"),
    period: integer("period"),
    blockSize: integer("block_size").notNull().default(1),
    errorMessage: text("error_message"),
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_plan_blocks_plan").on(table.planId),
    index("idx_plan_blocks_curriculum").on(table.curriculumId),
    unique("unique_plan_session").on(table.planId, table.curriculumId, table.sessionNumber),
  ]
);

// ─── Schema Exports ──────────────────────────────────────────

export const schema = {
  users,
  sessions,
  rooms,
  scheduleEntries,
  unifiedSlots,
  memberProfiles,
  groups,
  reservations,
  webhookEndpoints,
  webhookDeliveryLogs,
  notificationPreferences,
  notifications,
};

export const curriculumSchema = {
  instructors,
  curricula,
  curriculumPlans,
  planBlocks,
};

// ─── Connection ──────────────────────────────────────────────

export function createConnection() {
  const connectionString =
    process.env.DATABASE_URL || "postgresql://localhost:5432/schedula";
  const client = postgres(connectionString);
  return drizzle(client, {
    schema: {
      users,
      sessions,
      rooms,
      scheduleEntries,
      unifiedSlots,
      memberProfiles,
      groups,
      reservations,
      webhookEndpoints,
      webhookDeliveryLogs,
      notificationPreferences,
      notifications,
      instructors,
      curricula,
      curriculumPlans,
      planBlocks,
    },
  });
}
