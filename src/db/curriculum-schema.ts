/**
 * カリキュラムモジュール (企業用パッチ)
 *
 * メインDBとは別にテーブルスキーマを定義。
 * 授業コマの管理が該当する。
 *
 * データ構造:
 * - 講師 (instructors): 各曜日で何限が出席可能か + 出講可能条件
 * - カリキュラム (curricula): 学科・カリキュラム名・担当講師・コマ数・回数・教室
 * - プラン (curriculum_plans): スケジュール繰り返しのための予定ブロック
 * - プランブロック (plan_blocks): パズルUI用の個別ブロック
 */

import { sqliteTable, text, integer, unique, index } from "drizzle-orm/sqlite-core";

// ─── 講師 (Instructors) ────────────────────────────────────
// 各講師は「各曜日で何限が出席可能か」と
// 「出講可能条件(週1日/特定の期間のみ可/不可)」の情報を持つ

export const instructors = sqliteTable("instructors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  major: text("major").notNull(),
  /** JSON array of course names this instructor can teach */
  courses: text("courses", { mode: "json" }).$type<string[]>().notNull().default([]),

  /**
   * 7×11 boolean matrix: availability[day][period]
   * day: 0=月, 1=火, ..., 6=日
   * period: 0=1限, 1=2限, ..., 10=11限
   */
  availability: text("availability", { mode: "json" }).$type<boolean[][]>().notNull(),

  /**
   * 出講可能条件の種別:
   * - "any": 制限なし
   * - "weekly_limit": 週N日まで
   * - "period_only": 特定期間のみ出講可
   * - "unavailable": 出講不可
   */
  availabilityConditionType: text("availability_condition_type").notNull().default("any"),

  /**
   * 出講可能条件の詳細 (JSON)
   * weekly_limit: { maxDaysPerWeek: number }
   * period_only: { startDate: string, endDate: string }
   * unavailable: {}
   * any: {}
   */
  availabilityCondition: text("availability_condition", { mode: "json" })
    .$type<Record<string, unknown>>()
    .notNull()
    .default({}),

  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── カリキュラム (Curricula) ───────────────────────────────
// 「どの学科で」「何のカリキュラムか」「どの講師が担当するか」
// 「何コマあるか」「何回開催するか」「どの教室で開催されるか」

export const curricula = sqliteTable("curricula", {
  id: text("id").primaryKey(),
  /** 学科名 */
  departmentName: text("department_name").notNull(),
  /** カリキュラム名 */
  name: text("name").notNull(),
  /** 担当講師ID */
  instructorId: text("instructor_id")
    .references(() => instructors.id)
    .notNull(),
  /** 1回あたりのコマ数 (例: 2コマ連続) */
  slotsPerSession: integer("slots_per_session").notNull().default(1),
  /** 開催回数 (学期中に何回行うか) */
  totalSessions: integer("total_sessions").notNull(),
  /** 教室タイプ (プラン設計時は教室を考慮しない) */
  roomType: text("room_type").notNull(),
  /** 割り当て済みの教室ID (プラン確定後に設定) */
  roomId: text("room_id"),
  /** 編集期限 */
  editableUntil: integer("editable_until", { mode: "timestamp" }).notNull(),
  /** 学期ID */
  termId: text("term_id").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── カリキュラムプラン (Curriculum Plans) ──────────────────
// スケジュールの繰り返しを行うための予定
// カリキュラムは「プラン」と「実スケジュール」の2データを持つ
// モジュールが担当するのは「プラン」

export const curriculumPlans = sqliteTable("curriculum_plans", {
  id: text("id").primaryKey(),
  /** 関連するカリキュラムID */
  curriculumId: text("curriculum_id")
    .references(() => curricula.id)
    .notNull(),
  /** プラン名 (例: "2026前期 情報工学科 プログラミング基礎") */
  name: text("name").notNull(),
  /** 学期ID */
  termId: text("term_id").notNull(),
  /**
   * プランの状態:
   * - "draft": 編集中
   * - "confirmed": 確定済み (実スケジュールに展開可能)
   * - "archived": アーカイブ済み
   */
  status: text("status").notNull().default("draft"),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── プランブロック (Plan Blocks) ───────────────────────────
// パズルゲームUIのブロックに対応する個別データ
// 画面下に配置する予定のブロックを置き、カレンダーの枠に詰めていく
// 枠外にブロックを置くことも可能 (未配置状態)
// ブロックは吸着する

export const planBlocks = sqliteTable(
  "plan_blocks",
  {
    id: text("id").primaryKey(),
    /** 所属するプランID */
    planId: text("plan_id")
      .references(() => curriculumPlans.id)
      .notNull(),
    /** 対応するカリキュラムID */
    curriculumId: text("curriculum_id")
      .references(() => curricula.id)
      .notNull(),
    /** セッション番号 (第N回) */
    sessionNumber: integer("session_number").notNull(),

    /**
     * 配置状態:
     * - "placed": カレンダー枠内に配置済み
     * - "unplaced": 枠外 (画面下の未配置エリア)
     * - "error": 予定が組めない状況 (コンフリクト等で欄外配置)
     */
    placementStatus: text("placement_status").notNull().default("unplaced"),

    /** 配置先の曜日 (0-6, null=未配置) */
    day: integer("day"),
    /** 配置先の開始コマ (0-10, null=未配置) */
    period: integer("period"),

    /**
     * ブロックの幅 (コマ数)
     * curricula.slotsPerSession と連動
     */
    blockSize: integer("block_size").notNull().default(1),

    /** エラーメッセージ (placementStatus="error"時) */
    errorMessage: text("error_message"),

    /** ブロック表示色 (CSS color) */
    color: text("color"),

    /** UI上のソート順 (未配置エリアでの順序) */
    sortOrder: integer("sort_order").notNull().default(0),

    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_plan_blocks_plan").on(table.planId),
    index("idx_plan_blocks_curriculum").on(table.curriculumId),
    unique("unique_plan_session").on(table.planId, table.curriculumId, table.sessionNumber),
  ]
);
