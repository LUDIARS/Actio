import {
  mysqlTable,
  varchar,
  int,
  bigint,
  boolean,
  timestamp,
  json,
  text,
  unique,
  index,
} from "drizzle-orm/mysql-core";
import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import { secretManager } from "../../config/secrets.js";

// ─── Users (FK アンカー + Schedula 固有のみ) ─────────────────
// 個人データ (name/email/role/auth) は Cernere で管理。
// AIFormat ルール (DROP COLUMN 禁止) のため legacy カラムは残置するが
// 新規コードからは読み書きしない。NOT NULL は解除。

export const users = mysqlTable("users", {
  id: varchar("id", { length: 255 }).primaryKey(),
  major: varchar("major", { length: 255 }),

  calendarAccessId: varchar("calendar_access_id", { length: 255 }),

  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // ─── legacy: 個人データは Cernere 側で管理 (AIFormat 個人データ保管禁止ルール) ───
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }).unique(),
  role: varchar("role", { length: 255 }).default("general"),
  passwordHash: varchar("password_hash", { length: 255 }),
  googleId: varchar("google_id", { length: 255 }).unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: bigint("google_token_expires_at", { mode: "number" }),
  googleScopes: json("google_scopes").$type<string[]>(),
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

// ─── Groups ─────────────────────────────────────────────────
// Note: "groups" is a reserved word in MySQL, so we use backtick-escaped table name

export const groups = mysqlTable("`groups`", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: varchar("description", { length: 1024 }),
  createdBy: varchar("created_by", { length: 255 }).notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Group Members ──────────────────────────────────────────

export const groupMembers = mysqlTable(
  "group_members",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    groupId: varchar("group_id", { length: 255 })
      .references(() => groups.id)
      .notNull(),
    userId: varchar("user_id", { length: 255 })
      .references(() => users.id)
      .notNull(),
    role: varchar("role", { length: 255 }).notNull().default("member"),
    joinedAt: timestamp("joined_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_group_member").on(table.groupId, table.userId),
    index("idx_group_member_user").on(table.userId),
    index("idx_group_member_group").on(table.groupId),
  ]
);

// ─── Group Schedules ────────────────────────────────────────

export const groupSchedules = mysqlTable(
  "group_schedules",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    groupId: varchar("group_id", { length: 255 })
      .references(() => groups.id)
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    day: int("day").notNull(),
    period: int("period").notNull(),
    duration: int("duration").notNull().default(1),
    date: varchar("date", { length: 255 }),
    scheduleType: varchar("schedule_type", { length: 255 }).notNull().default("recurring"),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_group_schedule_group").on(table.groupId),
    index("idx_group_schedule_date").on(table.date),
  ]
);

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

// ─── Personal Events ────────────────────────────────────────

export const personalEvents = mysqlTable(
  "personal_events",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .references(() => users.id)
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    day: int("day").notNull(),
    period: int("period").notNull(),
    duration: int("duration").notNull().default(1),
    startTime: varchar("start_time", { length: 10 }),
    endTime: varchar("end_time", { length: 10 }),
    eventType: varchar("event_type", { length: 255 }).notNull().default("personal"),
    planId: varchar("plan_id", { length: 255 }),
    isPrivate: boolean("is_private").notNull().default(true),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_personal_event_user").on(table.userId),
    index("idx_personal_event_plan").on(table.planId),
    unique("unique_personal_slot").on(table.userId, table.day, table.period),
  ]
);

// ─── Plans ──────────────────────────────────────────────────

export const plans = mysqlTable(
  "plans",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .references(() => users.id)
      .notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    days: json("days").$type<number[]>().notNull(),
    startPeriod: int("start_period").notNull(),
    duration: int("duration").notNull().default(1),
    eventType: varchar("event_type", { length: 255 }).notNull().default("personal"),
    isPrivate: boolean("is_private").notNull().default(true),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_plan_user").on(table.userId),
  ]
);

// ─── My Plans ───────────────────────────────────────────────

export const myPlans = mysqlTable(
  "my_plans",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    userId: varchar("user_id", { length: 255 })
      .references(() => users.id)
      .notNull(),
    groupId: varchar("group_id", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    patternType: varchar("pattern_type", { length: 255 }).notNull().default("basic"),
    termId: varchar("term_id", { length: 255 })
      .references(() => terms.id),
    weeklySchedule: json("weekly_schedule").$type<
      Record<string, Array<{ startTime: string; endTime: string; title: string; period?: number; duration?: number }>>
    >().notNull(),
    isActive: boolean("is_active").notNull().default(true),
    priority: int("priority").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_myplan_user").on(table.userId),
    index("idx_myplan_group").on(table.groupId),
  ]
);

// ─── Smart Scheduler: Tasks ─────────────────────────────────

export const schedulingTasks = mysqlTable(
  "scheduling_tasks",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    groupId: varchar("group_id", { length: 255 })
      .references(() => groups.id)
      .notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    duration: int("duration").notNull().default(1),
    priority: int("priority").notNull().default(0),
    preferredDays: json("preferred_days").$type<number[]>().notNull(),
    preferredPeriods: json("preferred_periods").$type<number[]>().notNull(),
    /** 担当講師ID (設定時は講師の空き時間に合わせて配置) */
    instructorId: varchar("instructor_id", { length: 255 }),
    status: varchar("status", { length: 255 }).notNull().default("pending"),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_schtask_group").on(table.groupId),
    index("idx_schtask_status").on(table.status),
  ]
);

// ─── Smart Scheduler: Results ───────────────────────────────

export const schedulingResults = mysqlTable(
  "scheduling_results",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    groupId: varchar("group_id", { length: 255 })
      .references(() => groups.id)
      .notNull(),
    status: varchar("status", { length: 255 }).notNull().default("draft"),
    placements: json("placements").$type<
      Array<{ taskId: string; title: string; day: number; period: number; duration: number; score: number }>
    >().notNull(),
    totalScore: int("total_score").notNull().default(0),
    createdBy: varchar("created_by", { length: 255 }).notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_schresult_group").on(table.groupId),
  ]
);

// ─── Voting Events ──────────────────────────────────────────

export const votingEvents = mysqlTable("voting_events", {
  id: varchar("id", { length: 255 }).primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: varchar("created_by", { length: 255 })
    .references(() => users.id)
    .notNull(),
  deadline: varchar("deadline", { length: 255 }),
  status: varchar("status", { length: 255 }).notNull().default("open"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Voting Candidates ─────────────────────────────────────

export const votingCandidates = mysqlTable(
  "voting_candidates",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    eventId: varchar("event_id", { length: 255 })
      .references(() => votingEvents.id)
      .notNull(),
    label: varchar("label", { length: 255 }).notNull(),
    sortOrder: int("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_candidate_event").on(table.eventId),
  ]
);

// ─── Votes ──────────────────────────────────────────────────

export const votes = mysqlTable(
  "votes",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    eventId: varchar("event_id", { length: 255 })
      .references(() => votingEvents.id)
      .notNull(),
    candidateId: varchar("candidate_id", { length: 255 })
      .references(() => votingCandidates.id)
      .notNull(),
    userId: varchar("user_id", { length: 255 })
      .references(() => users.id)
      .notNull(),
    answer: varchar("answer", { length: 255 }).notNull(),
    isAutoReply: boolean("is_auto_reply").notNull().default(false),
    comment: text("comment"),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: timestamp("updated_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_vote_per_user_candidate").on(table.eventId, table.candidateId, table.userId),
    index("idx_vote_event").on(table.eventId),
    index("idx_vote_user").on(table.userId),
  ]
);

// ─── Departments ────────────────────────────────────────────

export const departments = mysqlTable("departments", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Instructors ────────────────────────────────────────────

export const instructors = mysqlTable("instructors", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Curricula ──────────────────────────────────────────────

export const curricula = mysqlTable(
  "curricula",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    departmentId: varchar("department_id", { length: 255 })
      .references(() => departments.id)
      .notNull(),
    /** コマ数 */
    periods: int("periods").notNull().default(1),
    instructorId: varchar("instructor_id", { length: 255 })
      .references(() => instructors.id),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_curricula_department").on(table.departmentId),
    index("idx_curricula_instructor").on(table.instructorId),
  ]
);

// ─── Curriculum Departments (junction table) ─────────────────

export const curriculumDepartments = mysqlTable(
  "curriculum_departments",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    curriculumId: varchar("curriculum_id", { length: 255 })
      .references(() => curricula.id, { onDelete: "cascade" })
      .notNull(),
    departmentId: varchar("department_id", { length: 255 })
      .references(() => departments.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    index("idx_cd_curriculum").on(table.curriculumId),
    index("idx_cd_department").on(table.departmentId),
  ]
);

// ─── Instructor Available Slots ─────────────────────────────

export const instructorAvailableSlots = mysqlTable(
  "instructor_available_slots",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    instructorId: varchar("instructor_id", { length: 255 })
      .references(() => instructors.id)
      .notNull(),
    day: int("day").notNull(),
    periods: json("periods").$type<number[]>().notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_available_slots_instructor").on(table.instructorId),
  ]
);

// ─── App Settings ───────────────────────────────────────────

export const appSettings = mysqlTable("app_settings", {
  key: varchar("key", { length: 255 }).primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Terms ──────────────────────────────────────────────────

export const terms = mysqlTable("terms", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  startDate: varchar("start_date", { length: 20 }).notNull(),
  endDate: varchar("end_date", { length: 20 }).notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Curriculum Placements ──────────────────────────────────

export const curriculumPlacements = mysqlTable(
  "curriculum_placements",
  {
    id: varchar("id", { length: 255 }).primaryKey(),
    termId: varchar("term_id", { length: 255 })
      .references(() => terms.id)
      .notNull(),
    curriculumId: varchar("curriculum_id", { length: 255 })
      .references(() => curricula.id)
      .notNull(),
    day: int("day").notNull(),
    period: int("period").notNull(),
    roomId: varchar("room_id", { length: 255 }),
    candidateCount: int("candidate_count").notNull().default(0),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_placement_term").on(table.termId),
    index("idx_placement_curriculum").on(table.curriculumId),
    unique("unique_placement_slot").on(table.termId, table.day, table.period, table.roomId),
  ]
);

// ─── Schema Exports ─────────────────────────────────────────

export const schema = {
  users,
  sessions,
  rooms,
  scheduleEntries,
  groups,
  groupMembers,
  groupSchedules,
  reservations,
  personalEvents,
  plans,
  myPlans,
  schedulingTasks,
  schedulingResults,
  webhookEndpoints,
  webhookDeliveryLogs,
  notificationPreferences,
  notifications,
  votingEvents,
  votingCandidates,
  votes,
  appSettings,
};

export const curriculumSchema = {
  departments,
  instructors,
  curricula,
  curriculumDepartments,
  instructorAvailableSlots,
  terms,
  curriculumPlacements,
};

// ─── Connection ─────────────────────────────────────────────

const allTables = {
  users,
  sessions,
  rooms,
  scheduleEntries,
  groups,
  groupMembers,
  groupSchedules,
  reservations,
  personalEvents,
  plans,
  myPlans,
  schedulingTasks,
  schedulingResults,
  webhookEndpoints,
  webhookDeliveryLogs,
  notificationPreferences,
  notifications,
  votingEvents,
  votingCandidates,
  votes,
  appSettings,
  departments,
  instructors,
  curricula,
  curriculumDepartments,
  instructorAvailableSlots,
  terms,
  curriculumPlacements,
};

export function createConnection() {
  const url = secretManager.getOrDefault("DATABASE_URL", "mysql://root@localhost:3306/schedula");
  const pool = mysql.createPool(url);
  return drizzle(pool, { schema: { ...allTables }, mode: "default" });
}
