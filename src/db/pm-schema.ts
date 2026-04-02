/**
 * PM (Project Management) モジュール — スキーマ定義
 *
 * データ構造:
 * - プロジェクト (pm_projects): GitHub/Notion と接続するプロジェクト
 * - タスク (pm_tasks): 外部ソースから同期されたタスク
 * - スナップショット (pm_task_snapshots): タスクの変更履歴
 * - マイルストーン (pm_milestones): 外部マイルストーン
 * - 検証結果 (pm_task_validations): タスク内容の検証結果
 * - コンフリクト (pm_conflicts): 双方向同期コンフリクト
 * - 分析キャッシュ (pm_analytics_cache): レポートキャッシュ
 */

import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

// ─── PM Projects ──────────────────────────────────────────
export const pmProjects = sqliteTable(
  "pm_projects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    source: text("source").notNull(), // "github" | "notion"
    /** JSON: 接続設定 (owner, repo, token, database_id 等) */
    sourceConfig: text("source_config", { mode: "json" })
      .$type<Record<string, string>>()
      .notNull(),
    syncIntervalMinutes: integer("sync_interval_minutes").notNull().default(15),
    lastSyncedAt: text("last_synced_at"),
    ownerId: text("owner_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_pm_projects_owner").on(table.ownerId),
  ]
);

// ─── PM Tasks ─────────────────────────────────────────────
export const pmTasks = sqliteTable(
  "pm_tasks",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    externalId: text("external_id").notNull(),
    externalUrl: text("external_url"),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status").notNull().default("open"), // open | in_progress | review | closed
    priority: text("priority").notNull().default("medium"), // low | medium | high | critical
    /** JSON: 担当者リスト */
    assignees: text("assignees", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** JSON: ラベルリスト */
    labels: text("labels", { mode: "json" }).$type<string[]>().notNull().default([]),
    dueDate: text("due_date"),
    milestoneExternalId: text("milestone_external_id"),
    milestoneName: text("milestone_name"),
    estimatedHours: real("estimated_hours"),
    /** JSON: 依存タスクID リスト */
    blockedBy: text("blocked_by", { mode: "json" }).$type<string[]>().notNull().default([]),
    descriptionHash: text("description_hash"),
    dirtyFlag: integer("dirty_flag").notNull().default(0),
    localUpdatedAt: text("local_updated_at"),
    externalUpdatedAt: text("external_updated_at"),
    lastSyncedAt: text("last_synced_at"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_pm_tasks_project").on(table.projectId),
    index("idx_pm_tasks_status").on(table.status),
    index("idx_pm_tasks_due_date").on(table.dueDate),
    index("idx_pm_tasks_dirty").on(table.dirtyFlag),
  ]
);

// ─── PM Task Snapshots ────────────────────────────────────
export const pmTaskSnapshots = sqliteTable(
  "pm_task_snapshots",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    changeType: text("change_type").notNull(), // created | updated | closed | reopened
    /** JSON: 変更フィールドと before/after */
    changedFields: text("changed_fields", { mode: "json" })
      .$type<Record<string, { before: unknown; after: unknown }>>()
      .notNull()
      .default({}),
    /** JSON: 変更時点の全データ */
    snapshotData: text("snapshot_data", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    detectedAt: text("detected_at").notNull(),
  },
  (table) => [
    index("idx_pm_snapshots_task").on(table.taskId),
  ]
);

// ─── PM Milestones ────────────────────────────────────────
export const pmMilestones = sqliteTable(
  "pm_milestones",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    dueDate: text("due_date"),
    state: text("state").notNull().default("open"), // open | closed
    externalUpdatedAt: text("external_updated_at"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_pm_milestones_project").on(table.projectId),
  ]
);

// ─── PM Task Validations ──────────────────────────────────
export const pmTaskValidations = sqliteTable(
  "pm_task_validations",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    score: integer("score").notNull().default(0),
    /** JSON: 検出された問題リスト */
    issues: text("issues", { mode: "json" })
      .$type<{ type: string; message: string; severity: string }[]>()
      .notNull()
      .default([]),
    /** JSON: 改善提案リスト */
    suggestions: text("suggestions", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** JSON: 関連コミット情報 */
    relatedCommits: text("related_commits", { mode: "json" })
      .$type<{ hash: string; message: string; author: string; date: string }[]>()
      .notNull()
      .default([]),
    /** JSON: 対応テストファイル */
    testFiles: text("test_files", { mode: "json" }).$type<string[]>().notNull().default([]),
    validatedAt: text("validated_at").notNull(),
  },
  (table) => [
    index("idx_pm_validations_task").on(table.taskId),
  ]
);

// ─── PM Conflicts ─────────────────────────────────────────
export const pmConflicts = sqliteTable(
  "pm_conflicts",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id").notNull(),
    projectId: text("project_id").notNull(),
    /** JSON: Schedula 側のスナップショット */
    localVersion: text("local_version", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** JSON: 外部側のスナップショット */
    externalVersion: text("external_version", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    /** JSON: 前回同期時点のスナップショット */
    baseVersion: text("base_version", { mode: "json" })
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    resolution: text("resolution").notNull().default("manual"), // auto_field_merge | claude_merge | force_external | manual
    /** JSON: マージ結果 */
    resolvedData: text("resolved_data", { mode: "json" }).$type<Record<string, unknown>>(),
    status: text("status").notNull().default("pending"), // pending | resolved | failed
    createdAt: text("created_at_text").notNull(),
    resolvedAt: text("resolved_at"),
  },
  (table) => [
    index("idx_pm_conflicts_project").on(table.projectId),
    index("idx_pm_conflicts_status").on(table.status),
  ]
);

// ─── PM Analytics Cache ───────────────────────────────────
export const pmAnalyticsCache = sqliteTable(
  "pm_analytics_cache",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    reportType: text("report_type").notNull(), // progress | critical_path | gompertz
    /** JSON: レポートデータ */
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull().default({}),
    generatedAt: text("generated_at").notNull(),
    expiresAt: text("expires_at").notNull(),
  },
  (table) => [
    index("idx_pm_cache_project_type").on(table.projectId, table.reportType),
  ]
);
