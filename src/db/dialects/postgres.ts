import {
  pgTable,
  text,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  unique,
  index,
} from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { secretManager } from "../../config/secrets.js";

// ─── Users (FK アンカー + Schedula 固有のみ) ─────────────────
// 個人データ (name/email/role/auth) は Cernere で管理。
// AIFormat ルール (DROP COLUMN 禁止) のため legacy カラムは残置するが
// 新規コードからは読み書きしない。NOT NULL は解除。

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  major: text("major"),

  calendarAccessId: text("calendar_access_id"),

  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),

  // ─── legacy: 個人データは Cernere 側で管理 (AIFormat 個人データ保管禁止ルール) ───
  name: text("name"),
  email: text("email").unique(),
  role: text("role").default("general"),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: bigint("google_token_expires_at", { mode: "number" }),
  googleScopes: jsonb("google_scopes").$type<string[]>(),
  lastLoginAt: timestamp("last_login_at"),
});

// ─── Module Installations / States (プラグイン管理) ─────────

export const moduleInstallations = pgTable("module_installations", {
  id: text("id").primaryKey(),
  moduleId: text("module_id").notNull().unique(),
  packageName: text("package_name").notNull(),
  packageVersion: text("package_version").notNull(),
  manifest: jsonb("manifest").$type<Record<string, unknown>>().notNull(),
  installedAt: timestamp("installed_at")
    .$defaultFn(() => new Date())
    .notNull(),
  installedBy: text("installed_by"),
});

export const moduleStates = pgTable(
  "module_states",
  {
    id: text("id").primaryKey(),
    moduleId: text("module_id").notNull(),
    scopeType: text("scope_type").notNull(),
    scopeId: text("scope_id"),
    enabled: boolean("enabled").notNull().default(true),
    changedAt: timestamp("changed_at")
      .$defaultFn(() => new Date())
      .notNull(),
    changedBy: text("changed_by"),
  },
  (t) => ({
    uniqScope: unique().on(t.moduleId, t.scopeType, t.scopeId),
  }),
);

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

// ─── Groups ──────────────────────────────────────────────────

export const groups = pgTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Group Members ──────────────────────────────────────────

export const groupMembers = pgTable(
  "group_members",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    role: text("role").notNull().default("member"),
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

export const groupSchedules = pgTable(
  "group_schedules",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    title: text("title").notNull(),
    description: text("description"),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    duration: integer("duration").notNull().default(1),
    date: text("date"),
    scheduleType: text("schedule_type").notNull().default("recurring"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_group_schedule_group").on(table.groupId),
    index("idx_group_schedule_date").on(table.date),
  ]
);

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

// ─── Personal Events ────────────────────────────────────────

export const personalEvents = pgTable(
  "personal_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    title: text("title").notNull(),
    description: text("description"),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    duration: integer("duration").notNull().default(1),
    startTime: text("start_time"),
    endTime: text("end_time"),
    eventType: text("event_type").notNull().default("personal"),
    planId: text("plan_id"),
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

export const plans = pgTable(
  "plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    days: jsonb("days").$type<number[]>().notNull().default([]),
    startPeriod: integer("start_period").notNull(),
    duration: integer("duration").notNull().default(1),
    eventType: text("event_type").notNull().default("personal"),
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

export const myPlans = pgTable(
  "my_plans",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    groupId: text("group_id"),
    name: text("name").notNull(),
    patternType: text("pattern_type").notNull().default("basic"),
    validFrom: text("valid_from"),
    validUntil: text("valid_until"),
    weeklySchedule: jsonb("weekly_schedule").$type<
      Record<string, Array<{ startTime: string; endTime: string; title: string; period?: number; duration?: number }>>
    >().notNull().default({}),
    isActive: boolean("is_active").notNull().default(true),
    priority: integer("priority").notNull().default(0),
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

export const schedulingTasks = pgTable(
  "scheduling_tasks",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    title: text("title").notNull(),
    duration: integer("duration").notNull().default(1),
    priority: integer("priority").notNull().default(0),
    preferredDays: jsonb("preferred_days").$type<number[]>().notNull().default([]),
    preferredPeriods: jsonb("preferred_periods").$type<number[]>().notNull().default([]),
    /** 担当講師ID (設定時は講師の空き時間に合わせて配置) */
    instructorId: text("instructor_id"),
    status: text("status").notNull().default("pending"),
    createdBy: text("created_by").notNull(),
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

export const schedulingResults = pgTable(
  "scheduling_results",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    status: text("status").notNull().default("draft"),
    placements: jsonb("placements").$type<
      Array<{ taskId: string; title: string; day: number; period: number; duration: number; score: number }>
    >().notNull().default([]),
    totalScore: integer("total_score").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_schresult_group").on(table.groupId),
  ]
);

// ─── Voting Events ──────────────────────────────────────────

export const votingEvents = pgTable("voting_events", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull().default(""),
  createdBy: text("created_by")
    .references(() => users.id)
    .notNull(),
  deadline: text("deadline"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Voting Candidates ─────────────────────────────────────

export const votingCandidates = pgTable(
  "voting_candidates",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id")
      .references(() => votingEvents.id)
      .notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_candidate_event").on(table.eventId),
  ]
);

// ─── Votes ──────────────────────────────────────────────────

export const votes = pgTable(
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
    answer: text("answer").notNull(),
    isAutoReply: boolean("is_auto_reply").notNull().default(false),
    comment: text("comment").notNull().default(""),
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

// ─── Departments ─────────────────────────────────────────────

export const departments = pgTable("departments", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Instructors ─────────────────────────────────────────────

export const instructors = pgTable("instructors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Curricula ───────────────────────────────────────────────

export const curricula = pgTable(
  "curricula",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    departmentId: text("department_id")
      .references(() => departments.id)
      .notNull(),
    /** コマ数 */
    periods: integer("periods").notNull().default(1),
    instructorId: text("instructor_id")
      .references(() => instructors.id),
    /** 所属タームID */
    termId: text("term_id")
      .references(() => terms.id),
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

export const curriculumDepartments = pgTable(
  "curriculum_departments",
  {
    id: text("id").primaryKey(),
    curriculumId: text("curriculum_id")
      .references(() => curricula.id, { onDelete: "cascade" })
      .notNull(),
    departmentId: text("department_id")
      .references(() => departments.id, { onDelete: "cascade" })
      .notNull(),
  },
  (table) => [
    index("idx_cd_curriculum").on(table.curriculumId),
    index("idx_cd_department").on(table.departmentId),
  ]
);

// ─── Instructor Available Slots ──────────────────────────────

export const instructorAvailableSlots = pgTable(
  "instructor_available_slots",
  {
    id: text("id").primaryKey(),
    instructorId: text("instructor_id")
      .references(() => instructors.id)
      .notNull(),
    day: integer("day").notNull(),
    periods: jsonb("periods").$type<number[]>().notNull(),
    createdAt: timestamp("created_at")
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_available_slots_instructor").on(table.instructorId),
  ]
);

// ─── App Settings ───────────────────────────────────────────

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Terms ──────────────────────────────────────────────────

export const terms = pgTable("terms", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  startDate: text("start_date").notNull(),
  endDate: text("end_date").notNull(),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Curriculum Placements ──────────────────────────────────

export const curriculumPlacements = pgTable(
  "curriculum_placements",
  {
    id: text("id").primaryKey(),
    termId: text("term_id")
      .references(() => terms.id)
      .notNull(),
    curriculumId: text("curriculum_id")
      .references(() => curricula.id)
      .notNull(),
    day: integer("day").notNull(),
    period: integer("period").notNull(),
    roomId: text("room_id"),
    candidateCount: integer("candidate_count").notNull().default(0),
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

// ─── Notification Templates ────────────────────────────────

export const notificationTemplates = pgTable("notification_templates", {
  id: text("id").primaryKey(),
  event: text("event").notNull(),
  platform: text("platform").notNull().default("all"),
  title: text("title").notNull(),
  body: text("body").notNull(),
  useCodeBlock: boolean("use_code_block").notNull().default(false),
  codeBlockLang: text("code_block_lang"),
  isDefault: boolean("is_default").notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
});

// ─── Holidays ──────────────────────────────────────────────

export const holidays = pgTable("holidays", {
  id: text("id").primaryKey(),
  groupId: text("group_id"),
  name: text("name").notNull(),
  date: text("date").notNull(),
  endDate: text("end_date"),
  holidayType: text("holiday_type").notNull().default("custom"),
  recurrence: text("recurrence").notNull().default("none"),
  source: text("source"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index("idx_holiday_group").on(t.groupId),
  index("idx_holiday_date").on(t.date),
  index("idx_holiday_type").on(t.holidayType),
]);

// ─── Core: Events (予定) ─────────────────────────────────────
// Schedula コア「予定」: 時間拘束のある未来の事象。

export const events = pgTable(
  "events",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    groupId: text("group_id"),
    title: text("title").notNull(),
    description: text("description"),
    startTime: timestamp("start_time").notNull(),
    endTime: timestamp("end_time").notNull(),
    isAllDay: boolean("is_all_day").notNull().default(false),
    location: text("location"),
    visibility: text("visibility").notNull().default("private"),
    pluginId: text("plugin_id"),
    pluginRef: text("plugin_ref"),
    pluginPayload: jsonb("plugin_payload").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => [
    index("idx_event_owner").on(t.ownerId),
    index("idx_event_group").on(t.groupId),
    index("idx_event_start").on(t.startTime),
    index("idx_event_plugin").on(t.pluginId),
  ]
);

// ─── Core: Tasks (タスク) ────────────────────────────────────
// Schedula コア「タスク」: 解決すべき現在の事象。

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id").notNull(),
    assigneeId: text("assignee_id"),
    groupId: text("group_id"),
    title: text("title").notNull(),
    description: text("description"),
    requirements: text("requirements"),
    status: text("status").notNull().default("open"),
    priority: text("priority").notNull().default("medium"),
    deadline: timestamp("deadline"),
    estimatedMinutes: integer("estimated_minutes"),
    pluginId: text("plugin_id"),
    pluginRef: text("plugin_ref"),
    pluginPayload: jsonb("plugin_payload").$type<Record<string, unknown>>(),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
  },
  (t) => [
    index("idx_task_owner").on(t.ownerId),
    index("idx_task_assignee").on(t.assigneeId),
    index("idx_task_group").on(t.groupId),
    index("idx_task_status").on(t.status),
    index("idx_task_deadline").on(t.deadline),
    index("idx_task_plugin").on(t.pluginId),
  ]
);

// ─── Group Events ──────────────────────────────────────────

export const groupEvents = pgTable("group_events", {
  id: text("id").primaryKey(),
  groupId: text("group_id").references(() => groups.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  date: text("date").notNull(),
  endDate: text("end_date"),
  allDay: boolean("all_day").notNull().default(true),
  period: integer("period"),
  duration: integer("duration").default(1),
  eventType: text("event_type").notNull().default("event"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index("idx_group_event_group").on(t.groupId),
  index("idx_group_event_date").on(t.date),
]);

// ─── Integration Settings ──────────────────────────────────

export const integrationSettings = pgTable("integration_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  service: text("service").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: bigint("token_expires_at", { mode: "number" }),
  config: jsonb("config").notNull().default({}),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  unique("unique_user_service").on(t.userId, t.service),
  index("idx_integration_user").on(t.userId),
]);

// ─── Sync Logs ─────────────────────────────────────────────

export const syncLogs = pgTable("sync_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  service: text("service").notNull(),
  action: text("action").notNull(),
  localEventId: text("local_event_id"),
  externalId: text("external_id"),
  status: text("status").notNull(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index("idx_sync_log_user").on(t.userId),
  index("idx_sync_log_service").on(t.service),
]);

// ─── API Clients ───────────────────────────────────────────

export const apiClients = pgTable("api_clients", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  clientId: text("client_id").notNull().unique(),
  clientSecretHash: text("client_secret_hash").notNull(),
  name: text("name").notNull(),
  scopes: jsonb("scopes").notNull().default(["calendar", "reminders", "schedules"]),
  isActive: boolean("is_active").notNull().default(true),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index("idx_api_client_user").on(t.userId),
  index("idx_api_client_client_id").on(t.clientId),
]);

// ─── Reminders ─────────────────────────────────────────────

export const reminders = pgTable("reminders", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => users.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  remindAt: text("remind_at").notNull(),
  repeatRule: text("repeat_rule").notNull().default("none"),
  status: text("status").notNull().default("pending"),
  source: text("source").notNull().default("web"),
  originalText: text("original_text"),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index("idx_reminder_user").on(t.userId),
  index("idx_reminder_status").on(t.status),
  index("idx_reminder_remind_at").on(t.remindAt),
]);

// ─── Machina (M3) ──────────────────────────────────────────

export const machinaChannelMonitors = pgTable("machina_channel_monitors", {
  id: text("id").primaryKey(),
  groupId: text("group_id").references(() => groups.id).notNull(),
  platform: text("platform").notNull(),
  channelId: text("channel_id").notNull(),
  channelName: text("channel_name").notNull(),
  webhookEndpointId: text("webhook_endpoint_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index("idx_machina_monitor_group").on(t.groupId),
  unique("unique_machina_monitor_channel").on(t.groupId, t.platform, t.channelId),
]);

export const machinaTasks = pgTable("machina_tasks", {
  id: text("id").primaryKey(),
  groupId: text("group_id").references(() => groups.id).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").notNull().default("pending"),
  priority: text("priority").notNull().default("medium"),
  assigneeId: text("assignee_id"),
  dueDate: text("due_date"),
  source: text("source").notNull().default("auto"),
  sourcePlatform: text("source_platform"),
  sourceMessageId: text("source_message_id"),
  sourceChannelId: text("source_channel_id"),
  sourceText: text("source_text"),
  confidence: integer("confidence").notNull().default(0),
  isCriticalPath: boolean("is_critical_path").notNull().default(false),
  relayedToPm: boolean("relayed_to_pm").notNull().default(false),
  pmTaskId: text("pm_task_id"),
  createdBy: text("created_by").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index("idx_machina_task_group").on(t.groupId),
  index("idx_machina_task_status").on(t.status),
  index("idx_machina_task_assignee").on(t.assigneeId),
  index("idx_machina_task_due").on(t.dueDate),
  index("idx_machina_task_priority").on(t.priority),
]);

export const machinaTaskLogs = pgTable("machina_task_logs", {
  id: text("id").primaryKey(),
  taskId: text("task_id").references(() => machinaTasks.id).notNull(),
  action: text("action").notNull(),
  previousValue: text("previous_value"),
  newValue: text("new_value"),
  reason: text("reason"),
  triggerMessageId: text("trigger_message_id"),
  performedBy: text("performed_by").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
}, (t) => [
  index("idx_machina_log_task").on(t.taskId),
]);

// ─── User Project Roles (プロジェクト別ロール) ──────────────────
// ※ユーザープロファイル (bio / displayName / avatarUrl 等) は Cernere 側で管理する
//   ため Schedula では保存しない。ここは Schedula 固有の業務ロールのみ。

export const userProjectRoles = pgTable(
  "user_project_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => users.id).notNull(),
    groupId: text("group_id").references(() => groups.id).notNull(),
    roleName: text("role_name").notNull(),
    createdAt: timestamp("created_at").$defaultFn(() => new Date()).notNull(),
    updatedAt: timestamp("updated_at").$defaultFn(() => new Date()).notNull(),
  },
  (table) => [
    unique("unique_user_group_role").on(table.userId, table.groupId, table.roleName),
    index("idx_user_project_roles_user").on(table.userId),
    index("idx_user_project_roles_group").on(table.groupId),
  ]
);

// ─── Schema Exports ──────────────────────────────────────────

export const schema = {
  users,
  moduleInstallations,
  moduleStates,
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
  userProjectRoles,
  notificationTemplates,
  holidays,
  groupEvents,
  events,
  tasks,
  integrationSettings,
  syncLogs,
  apiClients,
  reminders,
  machinaChannelMonitors,
  machinaTasks,
  machinaTaskLogs,
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

// ─── Connection ──────────────────────────────────────────────

const DB_SCHEMA = {
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
  userProjectRoles,
  notificationTemplates,
  holidays,
  groupEvents,
  events,
  tasks,
  integrationSettings,
  syncLogs,
  apiClients,
  reminders,
  machinaChannelMonitors,
  machinaTasks,
  machinaTaskLogs,
};

/**
 * PostgreSQL 接続をリトライ付きで確立する
 * "invalid length of startup packet" エラーを防ぐため、接続確認まで行う
 */
export async function waitForPostgres(
  connectionString: string,
  maxRetries = 10,
  baseDelayMs = 1000
): Promise<ReturnType<typeof postgres>> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    let client: ReturnType<typeof postgres> | null = null;
    try {
      console.log(
        `[db:postgres] 接続試行 ${attempt}/${maxRetries} → ${connectionString.replace(/\/\/.*@/, "//***:***@")}`
      );
      client = postgres(connectionString, {
        connect_timeout: 10,
        max: 10,
        idle_timeout: 30,
      });

      // 実際にクエリを実行して接続を検証する
      const result = await client`SELECT 1 AS ok`;
      console.log(
        `[db:postgres] 接続成功 (attempt ${attempt}) — SELECT 1 = ${JSON.stringify(result)}`
      );
      return client;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[db:postgres] 接続失敗 (attempt ${attempt}/${maxRetries}): ${message}`
      );

      // 失敗した接続を閉じる
      if (client) {
        try {
          await client.end();
        } catch {
          // ignore cleanup errors
        }
      }

      if (attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1); // exponential backoff
        console.log(`[db:postgres] ${delay}ms 後にリトライします...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        console.error(
          `[db:postgres] ${maxRetries} 回の試行すべて失敗。起動を中止します。`
        );
        throw new Error(
          `PostgreSQL への接続に失敗しました (${maxRetries} 回試行): ${message}`
        );
      }
    }
  }

  // unreachable, but TypeScript needs this
  throw new Error("unreachable");
}

export function createConnection() {
  const connectionString =
    secretManager.getOrDefault("DATABASE_URL", "postgresql://localhost:5432/schedula");
  console.log(
    `[db:postgres] createConnection called (lazy — 接続は初回クエリ時に確立されます)`
  );
  const client = postgres(connectionString, {
    connect_timeout: 10,
    max: 10,
    idle_timeout: 30,
  });
  return drizzle(client, { schema: DB_SCHEMA });
}

/**
 * リトライ付き接続を使用して Drizzle インスタンスを生成する
 */
export async function createConnectionWithRetry() {
  const connectionString =
    secretManager.getOrDefault("DATABASE_URL", "postgresql://localhost:5432/schedula");
  console.log("[db:postgres] createConnectionWithRetry 開始");
  const client = await waitForPostgres(connectionString);

  // 新規テーブルの自動作成 (migrate.ts を手動実行しなくても動くように)
  try {
    await client`
      CREATE TABLE IF NOT EXISTS terms (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS curriculum_placements (
        id TEXT PRIMARY KEY,
        term_id TEXT NOT NULL REFERENCES terms(id),
        curriculum_id TEXT NOT NULL REFERENCES curricula(id),
        day INTEGER NOT NULL,
        period INTEGER NOT NULL,
        room_id TEXT,
        candidate_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(term_id, day, period, room_id)
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_placement_term ON curriculum_placements(term_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_placement_curriculum ON curriculum_placements(curriculum_id)`;
    console.log("[db:postgres] terms/curriculum_placements テーブル確認完了");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists")) {
      console.warn("[db:postgres] テーブル自動作成エラー:", msg);
    }
  }

  // 休日テーブル
  try {
    await client`
      CREATE TABLE IF NOT EXISTS holidays (
        id TEXT PRIMARY KEY,
        group_id TEXT,
        name TEXT NOT NULL,
        date TEXT NOT NULL,
        end_date TEXT,
        holiday_type TEXT NOT NULL DEFAULT 'custom',
        recurrence TEXT NOT NULL DEFAULT 'none',
        source TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_holiday_group ON holidays(group_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_holiday_date ON holidays(date)`;
    await client`CREATE INDEX IF NOT EXISTS idx_holiday_type ON holidays(holiday_type)`;

    await client`
      CREATE TABLE IF NOT EXISTS group_events (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id),
        title TEXT NOT NULL,
        description TEXT,
        date TEXT NOT NULL,
        end_date TEXT,
        all_day BOOLEAN NOT NULL DEFAULT TRUE,
        period INTEGER,
        duration INTEGER DEFAULT 1,
        event_type TEXT NOT NULL DEFAULT 'event',
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_group_event_group ON group_events(group_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_group_event_date ON group_events(date)`;
    console.log("[db:postgres] holidays/group_events テーブル確認完了");
  } catch (err) {
    const msg2 = err instanceof Error ? err.message : String(err);
    if (!msg2.includes("already exists")) {
      console.warn("[db:postgres] holidays/group_events テーブル自動作成エラー:", msg2);
    }
  }

  // ─── Core: events / tasks (予定 / タスク) ──────────────────
  try {
    await client`
      CREATE TABLE IF NOT EXISTS events (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        group_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        start_time TIMESTAMP NOT NULL,
        end_time TIMESTAMP NOT NULL,
        is_all_day BOOLEAN NOT NULL DEFAULT FALSE,
        location TEXT,
        visibility TEXT NOT NULL DEFAULT 'private',
        plugin_id TEXT,
        plugin_ref TEXT,
        plugin_payload JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_event_owner ON events(owner_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_event_group ON events(group_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_event_start ON events(start_time)`;
    await client`CREATE INDEX IF NOT EXISTS idx_event_plugin ON events(plugin_id)`;

    await client`
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL,
        assignee_id TEXT,
        group_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        requirements TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'medium',
        deadline TIMESTAMP,
        estimated_minutes INTEGER,
        plugin_id TEXT,
        plugin_ref TEXT,
        plugin_payload JSONB,
        completed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_task_owner ON tasks(owner_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_task_assignee ON tasks(assignee_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_task_group ON tasks(group_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_task_status ON tasks(status)`;
    await client`CREATE INDEX IF NOT EXISTS idx_task_deadline ON tasks(deadline)`;
    await client`CREATE INDEX IF NOT EXISTS idx_task_plugin ON tasks(plugin_id)`;
    console.log("[db:postgres] events/tasks テーブル確認完了");
  } catch (err) {
    const msg3 = err instanceof Error ? err.message : String(err);
    if (!msg3.includes("already exists")) {
      console.warn("[db:postgres] events/tasks テーブル自動作成エラー:", msg3);
    }
  }

  // モジュール管理テーブル (Module SDK: installation + enable/disable state)
  try {
    await client`
      CREATE TABLE IF NOT EXISTS module_installations (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL UNIQUE,
        package_name TEXT NOT NULL,
        package_version TEXT NOT NULL,
        manifest JSONB NOT NULL,
        installed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        installed_by TEXT
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS module_states (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL,
        scope_type TEXT NOT NULL,
        scope_id TEXT,
        enabled BOOLEAN NOT NULL DEFAULT TRUE,
        changed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        changed_by TEXT,
        UNIQUE(module_id, scope_type, scope_id)
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_module_states_lookup ON module_states(module_id, scope_type, scope_id)`;
    console.log("[db:postgres] module_installations/module_states テーブル確認完了");
  } catch (err) {
    const msg4 = err instanceof Error ? err.message : String(err);
    if (!msg4.includes("already exists")) {
      console.warn("[db:postgres] module_installations/module_states テーブル自動作成エラー:", msg4);
    }
  }

  // PM モジュールテーブル
  try {
    await client`
      CREATE TABLE IF NOT EXISTS pm_projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        source TEXT NOT NULL,
        source_config JSONB NOT NULL DEFAULT '{}',
        sync_interval_minutes INTEGER NOT NULL DEFAULT 15,
        last_synced_at TEXT,
        owner_id TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_projects_owner ON pm_projects(owner_id)`;
    await client`
      CREATE TABLE IF NOT EXISTS pm_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        external_url TEXT,
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'open',
        priority TEXT NOT NULL DEFAULT 'medium',
        assignees JSONB NOT NULL DEFAULT '[]',
        labels JSONB NOT NULL DEFAULT '[]',
        due_date TEXT,
        milestone_external_id TEXT,
        milestone_name TEXT,
        estimated_hours REAL,
        blocked_by JSONB NOT NULL DEFAULT '[]',
        description_hash TEXT,
        dirty_flag INTEGER NOT NULL DEFAULT 0,
        local_updated_at TEXT,
        external_updated_at TEXT,
        last_synced_at TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_tasks_project ON pm_tasks(project_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_tasks_status ON pm_tasks(status)`;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_tasks_due_date ON pm_tasks(due_date)`;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_tasks_dirty ON pm_tasks(dirty_flag)`;
    await client`
      CREATE TABLE IF NOT EXISTS pm_task_snapshots (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        change_type TEXT NOT NULL,
        changed_fields JSONB NOT NULL DEFAULT '{}',
        snapshot_data JSONB NOT NULL DEFAULT '{}',
        detected_at TEXT NOT NULL
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_snapshots_task ON pm_task_snapshots(task_id)`;
    await client`
      CREATE TABLE IF NOT EXISTS pm_milestones (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT,
        state TEXT NOT NULL DEFAULT 'open',
        external_updated_at TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_milestones_project ON pm_milestones(project_id)`;
    await client`
      CREATE TABLE IF NOT EXISTS pm_task_validations (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        score INTEGER NOT NULL DEFAULT 0,
        issues JSONB NOT NULL DEFAULT '[]',
        suggestions JSONB NOT NULL DEFAULT '[]',
        related_commits JSONB NOT NULL DEFAULT '[]',
        test_files JSONB NOT NULL DEFAULT '[]',
        validated_at TEXT NOT NULL
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_validations_task ON pm_task_validations(task_id)`;
    await client`
      CREATE TABLE IF NOT EXISTS pm_conflicts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        project_id TEXT NOT NULL,
        local_version JSONB NOT NULL DEFAULT '{}',
        external_version JSONB NOT NULL DEFAULT '{}',
        base_version JSONB NOT NULL DEFAULT '{}',
        resolution TEXT NOT NULL DEFAULT 'manual',
        resolved_data JSONB,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at_text TEXT NOT NULL,
        resolved_at TEXT
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_conflicts_project ON pm_conflicts(project_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_conflicts_status ON pm_conflicts(status)`;
    await client`
      CREATE TABLE IF NOT EXISTS pm_analytics_cache (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        report_type TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}',
        generated_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_pm_cache_project_type ON pm_analytics_cache(project_id, report_type)`;
    console.log("[db:postgres] PM モジュールテーブル確認完了");
  } catch (err) {
    const msg3 = err instanceof Error ? err.message : String(err);
    if (!msg3.includes("already exists")) {
      console.warn("[db:postgres] PM テーブル自動作成エラー:", msg3);
    }
  }

  // カラム追加マイグレーション (既存DBとの互換)
  try { await client`ALTER TABLE group_schedules ADD COLUMN IF NOT EXISTS label TEXT`; } catch { /* ignore */ }
  try { await client`ALTER TABLE curricula ADD COLUMN IF NOT EXISTS term_id TEXT REFERENCES terms(id)`; } catch { /* ignore */ }
  try { await client`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`; } catch { /* ignore */ }

  // プロジェクト別ロール (業務ロール)
  // ※ ユーザープロファイル (bio / displayName / avatarUrl 等) は Cernere 側で管理
  try {
    await client`
      CREATE TABLE IF NOT EXISTS user_project_roles (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        group_id TEXT NOT NULL REFERENCES groups(id),
        role_name TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, group_id, role_name)
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_user_project_roles_user ON user_project_roles(user_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_user_project_roles_group ON user_project_roles(group_id)`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists")) {
      console.warn("[db:postgres] user_project_roles 作成エラー:", msg);
    }
  }

  // Reminders / 通知テンプレート / 連携 / API クライアント / Machina
  try {
    await client`
      CREATE TABLE IF NOT EXISTS notification_templates (
        id TEXT PRIMARY KEY,
        event TEXT NOT NULL,
        platform TEXT NOT NULL DEFAULT 'all',
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        use_code_block BOOLEAN NOT NULL DEFAULT FALSE,
        code_block_lang TEXT,
        is_default BOOLEAN NOT NULL DEFAULT FALSE,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`
      CREATE TABLE IF NOT EXISTS integration_settings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        service TEXT NOT NULL,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at BIGINT,
        config JSONB NOT NULL DEFAULT '{}',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(user_id, service)
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_integration_user ON integration_settings(user_id)`;
    await client`
      CREATE TABLE IF NOT EXISTS sync_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        service TEXT NOT NULL,
        action TEXT NOT NULL,
        local_event_id TEXT,
        external_id TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_sync_log_user ON sync_logs(user_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_sync_log_service ON sync_logs(service)`;
    await client`
      CREATE TABLE IF NOT EXISTS api_clients (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        client_id TEXT NOT NULL UNIQUE,
        client_secret_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        scopes JSONB NOT NULL DEFAULT '["calendar","reminders","schedules"]',
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        last_used_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_api_client_user ON api_clients(user_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_api_client_client_id ON api_clients(client_id)`;
    await client`
      CREATE TABLE IF NOT EXISTS reminders (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT,
        remind_at TEXT NOT NULL,
        repeat_rule TEXT NOT NULL DEFAULT 'none',
        status TEXT NOT NULL DEFAULT 'pending',
        source TEXT NOT NULL DEFAULT 'web',
        original_text TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_reminder_user ON reminders(user_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_reminder_status ON reminders(status)`;
    await client`CREATE INDEX IF NOT EXISTS idx_reminder_remind_at ON reminders(remind_at)`;
    await client`
      CREATE TABLE IF NOT EXISTS machina_channel_monitors (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id),
        platform TEXT NOT NULL,
        channel_id TEXT NOT NULL,
        channel_name TEXT NOT NULL,
        webhook_endpoint_id TEXT,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(group_id, platform, channel_id)
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_machina_monitor_group ON machina_channel_monitors(group_id)`;
    await client`
      CREATE TABLE IF NOT EXISTS machina_tasks (
        id TEXT PRIMARY KEY,
        group_id TEXT NOT NULL REFERENCES groups(id),
        title TEXT NOT NULL,
        description TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        priority TEXT NOT NULL DEFAULT 'medium',
        assignee_id TEXT,
        due_date TEXT,
        source TEXT NOT NULL DEFAULT 'auto',
        source_platform TEXT,
        source_message_id TEXT,
        source_channel_id TEXT,
        source_text TEXT,
        confidence INTEGER NOT NULL DEFAULT 0,
        is_critical_path BOOLEAN NOT NULL DEFAULT FALSE,
        relayed_to_pm BOOLEAN NOT NULL DEFAULT FALSE,
        pm_task_id TEXT,
        created_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_machina_task_group ON machina_tasks(group_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_machina_task_status ON machina_tasks(status)`;
    await client`CREATE INDEX IF NOT EXISTS idx_machina_task_assignee ON machina_tasks(assignee_id)`;
    await client`CREATE INDEX IF NOT EXISTS idx_machina_task_due ON machina_tasks(due_date)`;
    await client`CREATE INDEX IF NOT EXISTS idx_machina_task_priority ON machina_tasks(priority)`;
    await client`
      CREATE TABLE IF NOT EXISTS machina_task_logs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES machina_tasks(id),
        action TEXT NOT NULL,
        previous_value TEXT,
        new_value TEXT,
        reason TEXT,
        trigger_message_id TEXT,
        performed_by TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `;
    await client`CREATE INDEX IF NOT EXISTS idx_machina_log_task ON machina_task_logs(task_id)`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("already exists")) {
      console.warn("[db:postgres] 追加テーブル自動作成エラー:", msg);
    }
  }

  console.log("[db:postgres] Drizzle ORM インスタンスを作成中...");
  const drizzleDb = drizzle(client, { schema: DB_SCHEMA });
  console.log("[db:postgres] Drizzle ORM インスタンス作成完了");
  return drizzleDb;
}
