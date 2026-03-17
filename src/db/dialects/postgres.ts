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

// ─── Users ───────────────────────────────────────────────────

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull().default("general"),
  major: text("major"),

  passwordHash: text("password_hash"),

  googleId: text("google_id").unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: bigint("google_token_expires_at", { mode: "number" }),

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
    instructorId: text("instructor_id")
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
  departments,
  instructors,
  curricula,
  instructorAvailableSlots,
};

// ─── Connection ──────────────────────────────────────────────

const DB_SCHEMA = {
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
  departments,
  instructors,
  curricula,
  instructorAvailableSlots,
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
    process.env.DATABASE_URL || "postgresql://localhost:5432/schedula";
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
    process.env.DATABASE_URL || "postgresql://localhost:5432/schedula";
  console.log("[db:postgres] createConnectionWithRetry 開始");
  const client = await waitForPostgres(connectionString);
  console.log("[db:postgres] Drizzle ORM インスタンスを作成中...");
  const drizzleDb = drizzle(client, { schema: DB_SCHEMA });
  console.log("[db:postgres] Drizzle ORM インスタンス作成完了");
  return drizzleDb;
}
