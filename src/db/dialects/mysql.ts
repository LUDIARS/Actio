import {
  mysqlTable,
  varchar,
  int,
  boolean,
  timestamp,
  json,
  text,
  unique,
  index,
} from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";

// ─── Users ───────────────────────────────────────────────────

export const users = mysqlTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  role: varchar("role", { length: 255 }).notNull().default("student"),
  major: varchar("major", { length: 255 }),

  passwordHash: varchar("password_hash", { length: 255 }),

  googleId: varchar("google_id", { length: 255 }).unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: int("google_token_expires_at"),

  calendarAccessId: varchar("calendar_access_id", { length: 255 }),

  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Sessions ────────────────────────────────────────────────

export const sessions = mysqlTable("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 255 })
    .references(() => users.id)
    .notNull(),
  refreshToken: varchar("refresh_token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Rooms ───────────────────────────────────────────────────

export const rooms = mysqlTable("rooms", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  capacity: int("capacity").notNull(),
  type: varchar("type", { length: 255 }).notNull(),
  equipment: json("equipment").$type<string[]>().notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Schedule Entries ────────────────────────────────────────

export const scheduleEntries = mysqlTable(
  "schedule_entries",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    day: int("day").notNull(),
    period: int("period").notNull(),
    curriculumId: varchar("curriculum_id", { length: 255 }).notNull(),
    roomId: varchar("room_id", { length: 255 }).references(() => rooms.id),
    instructorId: varchar("instructor_id", { length: 255 }).notNull(),
    candidateCount: int("candidate_count").notNull().default(0),
    isConfirmed: boolean("is_confirmed").notNull().default(false),
    termId: varchar("term_id", { length: 255 }).notNull(),
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

// ─── Unified Slots ──────────────────────────────────────────

export const unifiedSlots = mysqlTable(
  "unified_slots",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    day: int("day").notNull(),
    period: int("period").notNull(),
    status: varchar("status", { length: 255 }).notNull().default("free"),
    majorLabel: varchar("major_label", { length: 255 }),
    isPrivate: boolean("is_private").notNull().default(false),
    sourceModule: varchar("source_module", { length: 255 }).notNull(),
    cachedAt: timestamp("cached_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_unified_user").on(table.userId),
    unique("unique_user_slot").on(table.userId, table.day, table.period, table.sourceModule),
  ]
);

// ─── Member Profiles ────────────────────────────────────────

export const memberProfiles = mysqlTable("member_profiles", {
  userId: varchar("user_id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  major: varchar("major", { length: 255 }).notNull(),
  attendanceDays: json("attendance_days").$type<number[]>().notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Groups ─────────────────────────────────────────────────
// Note: "groups" is a reserved word in MySQL, so we use backtick-escaped table name

export const groups = mysqlTable("`groups`", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  members: json("members").$type<string[]>().notNull(),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Reservations ───────────────────────────────────────────

export const reservations = mysqlTable(
  "reservations",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    groupId: varchar("group_id", { length: 255 })
      .references(() => groups.id)
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    day: int("day").notNull(),
    period: int("period").notNull(),
    roomId: varchar("room_id", { length: 255 })
      .references(() => rooms.id)
      .notNull(),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    participants: json("participants").$type<string[]>().notNull(),
    status: varchar("status", { length: 255 }).notNull().default("pending"),
    note: text("note"),
    version: int("version").notNull().default(1),
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

// ─── Webhook Endpoints ──────────────────────────────────────

export const webhookEndpoints = mysqlTable("webhook_endpoints", {
  id: varchar("id", { length: 255 }).primaryKey(),
  url: text("url").notNull(),
  events: json("events").$type<string[]>().notNull(),
  secret: varchar("secret", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  failCount: int("fail_count").notNull().default(0),
  lastDeliveredAt: timestamp("last_delivered_at"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Webhook Delivery Logs ──────────────────────────────────

export const webhookDeliveryLogs = mysqlTable(
  "webhook_delivery_logs",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    webhookId: varchar("webhook_id", { length: 255 })
      .references(() => webhookEndpoints.id)
      .notNull(),
    deliveryId: varchar("delivery_id", { length: 255 }).notNull(),
    event: varchar("event", { length: 255 }).notNull(),
    statusCode: int("status_code"),
    success: boolean("success").notNull(),
    retryCount: int("retry_count").notNull().default(0),
    latencyMs: int("latency_ms").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [index("idx_delivery_webhook").on(table.webhookId)]
);

// ─── Notification Preferences ───────────────────────────────

export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    channel: varchar("channel", { length: 255 }).notNull(),
    enabledEvents: json("enabled_events").$type<string[]>().notNull(),
    reminderDayBefore: boolean("reminder_day_before").notNull().default(true),
    reminderDayBeforeTime: varchar("reminder_day_before_time", { length: 255 }).notNull().default("18:00"),
    reminderMorningOf: boolean("reminder_morning_of").notNull().default(true),
    reminderMorningOfTime: varchar("reminder_morning_of_time", { length: 255 }).notNull().default("08:00"),
    reminderBefore: boolean("reminder_before").notNull().default(true),
    reminderBeforeMinutes: int("reminder_before_minutes").notNull().default(15),
    quietHoursStart: varchar("quiet_hours_start", { length: 255 }).notNull().default("22:00"),
    quietHoursEnd: varchar("quiet_hours_end", { length: 255 }).notNull().default("07:00"),
  },
  (table) => [
    unique("unique_user_channel").on(table.userId, table.channel),
  ]
);

// ─── Notifications ──────────────────────────────────────────

export const notifications = mysqlTable(
  "notifications",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 }).notNull(),
    event: varchar("event", { length: 255 }).notNull(),
    channel: varchar("channel", { length: 255 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
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

// ─── Instructors ────────────────────────────────────────────

export const instructors = mysqlTable("instructors", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  major: varchar("major", { length: 255 }).notNull(),
  courses: json("courses").$type<string[]>().notNull(),
  availability: json("availability").$type<boolean[][]>().notNull(),
  availabilityConditionType: varchar("availability_condition_type", { length: 255 }).notNull().default("any"),
  availabilityCondition: json("availability_condition").$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Curricula ──────────────────────────────────────────────

export const curricula = mysqlTable("curricula", {
  id: varchar("id", { length: 255 }).primaryKey(),
  departmentName: varchar("department_name", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  instructorId: varchar("instructor_id", { length: 255 })
    .references(() => instructors.id)
    .notNull(),
  slotsPerSession: int("slots_per_session").notNull().default(1),
  totalSessions: int("total_sessions").notNull(),
  roomType: varchar("room_type", { length: 255 }).notNull(),
  roomId: varchar("room_id", { length: 255 }),
  editableUntil: timestamp("editable_until").notNull(),
  termId: varchar("term_id", { length: 255 }).notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Curriculum Plans ───────────────────────────────────────

export const curriculumPlans = mysqlTable("curriculum_plans", {
  id: varchar("id", { length: 255 }).primaryKey(),
  curriculumId: varchar("curriculum_id", { length: 255 })
    .references(() => curricula.id)
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  termId: varchar("term_id", { length: 255 }).notNull(),
  status: varchar("status", { length: 255 }).notNull().default("draft"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Plan Blocks ────────────────────────────────────────────

export const planBlocks = mysqlTable(
  "plan_blocks",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    planId: varchar("plan_id", { length: 255 })
      .references(() => curriculumPlans.id)
      .notNull(),
    curriculumId: varchar("curriculum_id", { length: 255 })
      .references(() => curricula.id)
      .notNull(),
    sessionNumber: int("session_number").notNull(),
    placementStatus: varchar("placement_status", { length: 255 }).notNull().default("unplaced"),
    day: int("day"),
    period: int("period"),
    blockSize: int("block_size").notNull().default(1),
    errorMessage: text("error_message"),
    color: varchar("color", { length: 255 }),
    sortOrder: int("sort_order").notNull().default(0),
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

// ─── Schema Exports ─────────────────────────────────────────

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

// ─── Connection ─────────────────────────────────────────────

const allTables = {
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
};

export function createConnection() {
  const url = process.env.DATABASE_URL || "mysql://root@localhost:3306/schedula";
  const pool = mysql.createPool(url);
  return drizzle(pool, { schema: { ...allTables }, mode: "default" });
}
