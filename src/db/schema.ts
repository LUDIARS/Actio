import { sqliteTable, text, integer, unique, index } from "drizzle-orm/sqlite-core";

// ─── Users (FK アンカー + Schedula 固有フィールド) ──────────
// 個人データ (name, email, role, password, OAuth トークン等) は
// Schedula DB に保管しない。Cernere を単一情報源とする。
// このテーブルは FK ターゲットおよび Schedula 固有メタデータ
// (academic major, calendar access ID 等) のみを保持する。
//
// 旧フィールド (name, email, role, passwordHash, google_*, lastLoginAt) は
// AIFormat ルール (DROP COLUMN 禁止) により残置するが、新規コードからは
// 一切読み書きしない。Drizzle スキーマ上は nullable に変更し、
// 既存レコード/データは保全する。

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  major: text("major"),

  // Schedula 固有: カレンダーアクセス ID (Google Calendar 連携用 nonce)
  calendarAccessId: text("calendar_access_id"),

  // ─── 以下は legacy: 個人データは Cernere 側で管理 (AIFormat 個人データ保管禁止ルール) ───
  // 新規コードから読み書きしない。スキーマ上は残置。
  name: text("name"),
  email: text("email").unique(),
  role: text("role").default("general"),
  passwordHash: text("password_hash"),
  googleId: text("google_id").unique(),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: integer("google_token_expires_at"),
  googleScopes: text("google_scopes", { mode: "json" }).$type<string[]>(),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),

  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── Module Installations (プラグインモジュール管理) ────────
// Phase 1: モジュールはソースコード内に存在するが、manifest 駆動で
// 有効/無効を切り替える。将来的に外部 npm パッケージからロードする。

export const moduleInstallations = sqliteTable("module_installations", {
  /** 一意ID */
  id: text("id").primaryKey(),
  /** モジュールID (manifest.id) */
  moduleId: text("module_id").notNull().unique(),
  /** パッケージ名 (Phase 1 ではソース内パス) */
  packageName: text("package_name").notNull(),
  /** パッケージバージョン (manifest.version または package.json) */
  packageVersion: text("package_version").notNull(),
  /** manifest snapshot (JSON, install 時点) */
  manifest: text("manifest", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  installedAt: integer("installed_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  installedBy: text("installed_by"),
});

/** モジュールの有効/無効状態 (3スコープ階層) */
export const moduleStates = sqliteTable(
  "module_states",
  {
    id: text("id").primaryKey(),
    /** モジュールID (installations.module_id と対応) */
    moduleId: text("module_id").notNull(),
    /** スコープ種別: "global" | "group" | "user" */
    scopeType: text("scope_type").notNull(),
    /** スコープID: global なら NULL、group なら groupId、user なら userId */
    scopeId: text("scope_id"),
    /** 有効フラグ */
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    changedAt: integer("changed_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    changedBy: text("changed_by"),
  },
  (t) => ({
    uniqScope: unique().on(t.moduleId, t.scopeType, t.scopeId),
  }),
);

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

// ─── Groups ─────────────────────────────────────────────────

export const groups = sqliteTable("groups", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  enabledModules: text("enabled_modules"),
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
    /** ターム/期間ラベル (例: "2026前期", "term-2026") — 再配置時にラベル単位で削除・再登録する */
    label: text("label"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_group_schedule_group").on(table.groupId),
    index("idx_group_schedule_date").on(table.date),
    index("idx_group_schedule_label").on(table.label),
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
    /** 連携先カレンダー予定ID (nullable) */
    calendarEventId: text("calendar_event_id"),
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
    period: integer("period").notNull(), // 0-10 (レガシー互換)
    /** 複数コマにまたがる場合のコマ数 */
    duration: integer("duration").notNull().default(1),
    /** 時間ベースのスケジュール: 開始時刻 (HH:MM) */
    startTime: text("start_time"),
    /** 時間ベースのスケジュール: 終了時刻 (HH:MM) */
    endTime: text("end_time"),
    /** イベント種別: personal / school_event */
    eventType: text("event_type").notNull().default("personal"),
    /** 繰り返し元のプランID (プランから自動生成された場合) */
    planId: text("plan_id"),
    isPrivate: integer("is_private", { mode: "boolean" }).notNull().default(true),
    /** Google Calendar同期時のイベントID */
    googleCalendarEventId: text("google_calendar_event_id"),
    /** Notion同期時のページID */
    notionPageId: text("notion_page_id"),
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
    /** 週間スケジュール: JSON { "0": [{ startTime, endTime, title }], ... } */
    weeklySchedule: text("weekly_schedule", { mode: "json" }).$type<
      Record<string, Array<{ startTime: string; endTime: string; title: string; period?: number; duration?: number }>>
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

// ─── Smart Scheduler: Tasks (配置したい予定) ─────────────────
// グループの空き状況を見て自動配置するための「入れたい予定」

export const schedulingTasks = sqliteTable(
  "scheduling_tasks",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    title: text("title").notNull(),
    /** 所要コマ数 (1コマ=1時間) */
    duration: integer("duration").notNull().default(1),
    /** 優先度 (大きいほど優先的に配置) */
    priority: integer("priority").notNull().default(0),
    /** 希望曜日 JSON array [0,1,2,...] (空=どの曜日でもOK) */
    preferredDays: text("preferred_days", { mode: "json" }).$type<number[]>().notNull().default([]),
    /** 希望コマ JSON array [0,1,2,...] (空=どのコマでもOK) */
    preferredPeriods: text("preferred_periods", { mode: "json" }).$type<number[]>().notNull().default([]),
    /** 担当講師ID (設定時は講師の空き時間に合わせて配置) */
    instructorId: text("instructor_id"),
    /** pending=未配置, placed=配置済み, failed=配置不可 */
    status: text("status").notNull().default("pending"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_schtask_group").on(table.groupId),
    index("idx_schtask_status").on(table.status),
  ]
);

// ─── Smart Scheduler: Results (自動配置結果) ─────────────────

export const schedulingResults = sqliteTable(
  "scheduling_results",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    /** draft=提案中, confirmed=確定, rejected=却下 */
    status: text("status").notNull().default("draft"),
    /** 配置結果 JSON: Array<{ taskId, day, period, score }> */
    placements: text("placements", { mode: "json" }).$type<
      Array<{ taskId: string; title: string; day: number; period: number; duration: number; score: number }>
    >().notNull().default([]),
    totalScore: integer("total_score").notNull().default(0),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_schresult_group").on(table.groupId),
  ]
);

// ─── App Settings (アプリ設定: GUI経由で管理) ────────────────
// key-valueストア形式でアプリ全体の設定を保存

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── M5: Webhook Endpoints ──────────────────────────────────

export const webhookEndpoints = sqliteTable("webhook_endpoints", {
  id: text("id").primaryKey(),
  url: text("url").notNull(),
  /** JSON array of event names */
  events: text("events", { mode: "json" }).$type<string[]>().notNull().default([]),
  secret: text("secret").notNull(),
  /** Platform: generic / slack / discord / line */
  platform: text("platform").notNull().default("generic"),
  /** Send method: webhook / bot */
  sendMethod: text("send_method").notNull().default("webhook"),
  /** Bot token (for bot send method) */
  botToken: text("bot_token"),
  /** Channel/Room ID (for bot send method) */
  channelId: text("channel_id"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull(),
  failCount: integer("fail_count").notNull().default(0),
  lastDeliveredAt: integer("last_delivered_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── M5: Notification Templates ─────────────────────────────

export const notificationTemplates = sqliteTable("notification_templates", {
  id: text("id").primaryKey(),
  /** Event name (e.g. "reservation.created") or "*" for default */
  event: text("event").notNull(),
  /** Platform: generic / slack / discord / line / all */
  platform: text("platform").notNull().default("all"),
  /** Template title (supports {variable} substitution) */
  title: text("title").notNull(),
  /** Template body (supports {variable} substitution and code blocks) */
  body: text("body").notNull(),
  /** Whether to use code block formatting */
  useCodeBlock: integer("use_code_block", { mode: "boolean" }).notNull().default(false),
  /** Code block language (for syntax highlighting) */
  codeBlockLang: text("code_block_lang"),
  /** Is system default (non-deletable) */
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
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

// ─── Holidays (休日・休業期間) ────────────────────────────────
// グループ単位、またはシステム全体で休日を管理する。
// 日本の祝日やお休み期間（審査会期間など）を登録。

export const holidays = sqliteTable(
  "holidays",
  {
    id: text("id").primaryKey(),
    /** グループID (nullならシステム全体) */
    groupId: text("group_id"),
    /** 休日名 (例: "元日", "審査会期間", "春休み") */
    name: text("name").notNull(),
    /** 開始日 (YYYY-MM-DD) */
    date: text("date").notNull(),
    /** 終了日 (YYYY-MM-DD) — 期間の場合、単日なら date と同じ */
    endDate: text("end_date"),
    /** 休日種別: national_holiday (祝日) / school_holiday (学校休日) / examination_period (審査会期間) / custom (カスタム) */
    holidayType: text("holiday_type").notNull().default("custom"),
    /** 繰り返し: none (単発) / yearly (毎年) */
    recurrence: text("recurrence").notNull().default("none"),
    /** 自動取得ソース (例: "japanese_holidays") — 手動ならnull */
    source: text("source"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_holiday_group").on(table.groupId),
    index("idx_holiday_date").on(table.date),
    index("idx_holiday_type").on(table.holidayType),
  ]
);

// ─── Integration Settings (外部サービス連携設定) ─────────────
// ユーザーごとのNotion/Google Calendar等の連携トークン・設定を保存

export const integrationSettings = sqliteTable(
  "integration_settings",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    /** サービス種別: google_calendar / notion */
    service: text("service").notNull(),
    /** アクセストークン (暗号化推奨) */
    accessToken: text("access_token"),
    /** リフレッシュトークン */
    refreshToken: text("refresh_token"),
    /** トークン有効期限 */
    tokenExpiresAt: integer("token_expires_at"),
    /** サービス固有の設定 JSON (例: Notion DB ID, Google Calendar ID) */
    config: text("config", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    /** 連携有効/無効 */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_user_service").on(table.userId, table.service),
    index("idx_integration_user").on(table.userId),
  ]
);

// ─── Sync Log (同期ログ) ──────────────────────────────────────
// 外部サービスとの同期結果を記録

export const syncLogs = sqliteTable(
  "sync_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    /** サービス種別: google_calendar / notion */
    service: text("service").notNull(),
    /** sync_push / sync_pull / create / update / delete */
    action: text("action").notNull(),
    /** 対象のローカルイベントID */
    localEventId: text("local_event_id"),
    /** 外部サービス側のID */
    externalId: text("external_id"),
    /** success / error */
    status: text("status").notNull(),
    /** エラー時のメッセージ */
    errorMessage: text("error_message"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_sync_log_user").on(table.userId),
    index("idx_sync_log_service").on(table.service),
  ]
);

// ─── API Clients (外部API連携用クレデンシャル) ─────────────────
// 各ユーザがAPIクライアントを発行し、外部からAPI操作が可能

export const apiClients = sqliteTable(
  "api_clients",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    /** クライアントID (公開値、再発行可能) */
    clientId: text("client_id").notNull().unique(),
    /** クライアントシークレット (bcryptハッシュで保存) */
    clientSecretHash: text("client_secret_hash").notNull(),
    /** 表示名 (ユーザが管理しやすいように) */
    name: text("name").notNull(),
    /** 許可スコープ JSON array ["calendar", "reminders", "schedules"] */
    scopes: text("scopes", { mode: "json" }).$type<string[]>().notNull().default(["calendar", "reminders", "schedules"]),
    /** 有効/無効 */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    /** 最終使用日時 */
    lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_api_client_user").on(table.userId),
    index("idx_api_client_client_id").on(table.clientId),
  ]
);

// ─── Reminders (リマインダー) ────────────────────────────────
// ユーザーごとのリマインダー。WebUI / API / Alexa 等から登録可能。

export const reminders = sqliteTable(
  "reminders",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    /** リマインダータイトル */
    title: text("title").notNull(),
    /** 詳細説明 */
    description: text("description"),
    /** 通知日時 (ISO 8601) */
    remindAt: text("remind_at").notNull(),
    /** 繰り返しルール: none / daily / weekly / monthly / yearly */
    repeatRule: text("repeat_rule").notNull().default("none"),
    /** ステータス: pending / done / cancelled */
    status: text("status").notNull().default("pending"),
    /** 登録元: web / api / alexa */
    source: text("source").notNull().default("web"),
    /** 自由テキスト入力時の元テキスト */
    originalText: text("original_text"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_reminder_user").on(table.userId),
    index("idx_reminder_status").on(table.status),
    index("idx_reminder_remind_at").on(table.remindAt),
  ]
);

// ─── User Profiles (ユーザープロフィール) ───────────────────────
// 自己紹介・プロフィール情報を保存

export const userProfiles = sqliteTable("user_profiles", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .references(() => users.id)
    .notNull()
    .unique(),
  /** 自己紹介・Bio */
  bio: text("bio").notNull().default(""),
  /** 表示名 (usersのnameと別に設定可能) */
  displayName: text("display_name"),
  /** アバターURL */
  avatarUrl: text("avatar_url"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── User Project Roles (プロジェクト別ロール) ──────────────────
// ユーザーがグループ（プロジェクト）ごとに担当する仕事上のロール
// groupMembers.role (owner/leader/member) とは別に、業務上の役割を自由入力

export const userProjectRoles = sqliteTable(
  "user_project_roles",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .references(() => users.id)
      .notNull(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    /** 仕事上のロール (例: "デザイナー", "PM", "エンジニア") */
    roleName: text("role_name").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    unique("unique_user_project_role").on(table.userId, table.groupId, table.roleName),
    index("idx_user_project_role_user").on(table.userId),
    index("idx_user_project_role_group").on(table.groupId),
  ]
);

// ─── M3 MACHINA: Channel Monitors (チャンネル監視設定) ────────
// グループごとにSlack/Discordのどのチャンネルを監視するかを設定

export const machinaChannelMonitors = sqliteTable(
  "machina_channel_monitors",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    /** プラットフォーム: slack / discord */
    platform: text("platform").notNull(),
    /** チャンネルID (Slack/Discord の channel ID) */
    channelId: text("channel_id").notNull(),
    /** チャンネル名 (表示用) */
    channelName: text("channel_name").notNull(),
    /** Webhook URL or Bot Token で受信する設定ID (webhookEndpoints.id) */
    webhookEndpointId: text("webhook_endpoint_id"),
    /** 有効/無効 */
    isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_machina_monitor_group").on(table.groupId),
    unique("unique_machina_monitor_channel").on(table.groupId, table.platform, table.channelId),
  ]
);

// ─── M3 MACHINA: Tasks (自動生成タスク) ──────────────────────
// Slack/Discordのログから自動生成されたタスク

export const machinaTasks = sqliteTable(
  "machina_tasks",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    /** タスクタイトル */
    title: text("title").notNull(),
    /** タスク詳細 */
    description: text("description"),
    /** ステータス: pending / in_progress / done / cancelled */
    status: text("status").notNull().default("pending"),
    /** 優先度: low / medium / high / critical */
    priority: text("priority").notNull().default("medium"),
    /** アサインされたユーザーID */
    assigneeId: text("assignee_id"),
    /** 納期 (ISO 8601) */
    dueDate: text("due_date"),
    /** 生成元: auto (自動検出) / command (コマンド) / manual (手動) */
    source: text("source").notNull().default("auto"),
    /** 生成元のプラットフォーム: slack / discord / manual */
    sourcePlatform: text("source_platform"),
    /** 生成元のメッセージID (Slack/Discord) */
    sourceMessageId: text("source_message_id"),
    /** 生成元のチャンネルID */
    sourceChannelId: text("source_channel_id"),
    /** 生成元のメッセージテキスト (解析に使用した原文) */
    sourceText: text("source_text"),
    /** AI解析の信頼度 (0.0〜1.0) */
    confidence: integer("confidence").notNull().default(0),
    /** クリティカルパス上かどうか */
    isCriticalPath: integer("is_critical_path", { mode: "boolean" }).notNull().default(false),
    /** PM (M2) へのリレー済みか */
    relayedToPm: integer("relayed_to_pm", { mode: "boolean" }).notNull().default(false),
    /** PM側のタスクID (M2へリレーした場合) */
    pmTaskId: text("pm_task_id"),
    /** タスクを作成したユーザーID (コマンド/手動の場合) */
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_machina_task_group").on(table.groupId),
    index("idx_machina_task_status").on(table.status),
    index("idx_machina_task_assignee").on(table.assigneeId),
    index("idx_machina_task_due").on(table.dueDate),
    index("idx_machina_task_priority").on(table.priority),
  ]
);

// ─── M3 MACHINA: Task Activity Log (タスク変更履歴) ──────────
// タスクの自動更新・アサイン変更・ステータス変更の履歴

export const machinaTaskLogs = sqliteTable(
  "machina_task_logs",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .references(() => machinaTasks.id)
      .notNull(),
    /** アクション: created / updated / assigned / status_changed / priority_changed / relayed */
    action: text("action").notNull(),
    /** 変更前の値 (JSON) */
    previousValue: text("previous_value"),
    /** 変更後の値 (JSON) */
    newValue: text("new_value"),
    /** 変更理由 (AI判定の根拠など) */
    reason: text("reason"),
    /** トリガー元メッセージID */
    triggerMessageId: text("trigger_message_id"),
    /** 実行者: system (自動) / userId */
    performedBy: text("performed_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_machina_log_task").on(table.taskId),
  ]
);

// ─── Group Events (グループ個別予定) ──────────────────────────
// グループ単位の特定日のイベント（学校行事、試験、休校日など）
// groupSchedules は曜日ベースの繰り返し予定だが、こちらは日付ベースの個別予定

export const groupEvents = sqliteTable(
  "group_events",
  {
    id: text("id").primaryKey(),
    groupId: text("group_id")
      .references(() => groups.id)
      .notNull(),
    /** イベントタイトル */
    title: text("title").notNull(),
    description: text("description"),
    /** 日付 (YYYY-MM-DD) */
    date: text("date").notNull(),
    /** 終了日 (YYYY-MM-DD) — 複数日にまたがる場合 */
    endDate: text("end_date"),
    /** 終日イベントか */
    allDay: integer("all_day", { mode: "boolean" }).notNull().default(true),
    /** 時限 (終日でない場合) */
    period: integer("period"),
    /** コマ数 (終日でない場合) */
    duration: integer("duration").default(1),
    /** イベント種別: event / holiday / examination_period / custom */
    eventType: text("event_type").notNull().default("event"),
    createdBy: text("created_by").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_group_event_group").on(table.groupId),
    index("idx_group_event_date").on(table.date),
  ]
);

// ─── Core: Events (予定) ──────────────────────────────────────
// Schedula のコア「予定」: 時間拘束のある未来の事象。
// 要件は持たず、確定した時間枠を表現する (例: MTG, 講義, 予約)。
//
// プラグイン (calendar / voting / facility-booking 等) は
// pluginId / pluginRef / pluginPayload 経由で固有データを保持する。
// プラグインなし (素の予定) でも作成可能。

export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    /** 作成者ユーザID */
    ownerId: text("owner_id").notNull(),
    /** グループ予定の場合のグループID (null = 個人予定) */
    groupId: text("group_id"),
    title: text("title").notNull(),
    description: text("description"),
    /** 開始時刻 (UTC) */
    startTime: integer("start_time", { mode: "timestamp" }).notNull(),
    /** 終了時刻 (UTC) */
    endTime: integer("end_time", { mode: "timestamp" }).notNull(),
    /** 終日予定か */
    isAllDay: integer("is_all_day", { mode: "boolean" }).notNull().default(false),
    /** 場所 (任意) */
    location: text("location"),
    /** 公開範囲: private / group / public */
    visibility: text("visibility").notNull().default("private"),
    /** 生成元プラグイン ID (例: "calendar", "voting", "facility-booking") */
    pluginId: text("plugin_id"),
    /** プラグイン側の参照 ID */
    pluginRef: text("plugin_ref"),
    /** プラグイン固有データ (JSON) */
    pluginPayload: text("plugin_payload", { mode: "json" })
      .$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_event_owner").on(table.ownerId),
    index("idx_event_group").on(table.groupId),
    index("idx_event_start").on(table.startTime),
    index("idx_event_plugin").on(table.pluginId),
  ]
);

// ─── Core: Tasks (タスク) ─────────────────────────────────────
// Schedula のコア「タスク」: 解決すべき現在の事象。
// 要件 (requirements) を持ち、時間拘束はないが、deadline で
// 期限を設定可能 (例: ToDo, Issue, レビュー依頼)。
//
// プラグイン (pm / machina 等) は pluginId / pluginRef /
// pluginPayload 経由で外部システムとの紐付けを保持する。

export const tasks = sqliteTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    /** 作成者ユーザID */
    ownerId: text("owner_id").notNull(),
    /** 担当者ユーザID (null = 未アサイン) */
    assigneeId: text("assignee_id"),
    /** グループタスクの場合のグループID */
    groupId: text("group_id"),
    title: text("title").notNull(),
    description: text("description"),
    /** 要件 (Markdown / freeform) */
    requirements: text("requirements"),
    /** ステータス: open / in_progress / blocked / done / cancelled */
    status: text("status").notNull().default("open"),
    /** 優先度: low / medium / high / critical */
    priority: text("priority").notNull().default("medium"),
    /** 期限 (UTC, null = 期限なし) */
    deadline: integer("deadline", { mode: "timestamp" }),
    /** 見積もり作業時間 (分) */
    estimatedMinutes: integer("estimated_minutes"),
    /** 生成元プラグイン ID (例: "pm", "machina") */
    pluginId: text("plugin_id"),
    /** プラグイン側の参照 ID (例: GitHub Issue 番号) */
    pluginRef: text("plugin_ref"),
    /** プラグイン固有データ (JSON) */
    pluginPayload: text("plugin_payload", { mode: "json" })
      .$type<Record<string, unknown>>(),
    /** 完了時刻 (status=done になったとき) */
    completedAt: integer("completed_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_task_owner").on(table.ownerId),
    index("idx_task_assignee").on(table.assigneeId),
    index("idx_task_group").on(table.groupId),
    index("idx_task_status").on(table.status),
    index("idx_task_deadline").on(table.deadline),
    index("idx_task_plugin").on(table.pluginId),
  ]
);
