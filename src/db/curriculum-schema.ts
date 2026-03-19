/**
 * カリキュラムモジュール — M1 スキーマ
 *
 * データ構造:
 * - 学科 (departments): トップレイヤの設定項目
 * - 講師 (instructors): トップレイヤの設定項目
 * - カリキュラム (curricula): 学科の下に複数。1人の講師 × 1つの学科
 * - 出講可能スロット (instructor_available_slots): 講師ごとの曜日 × コマ
 *
 * 設定メニュー:
 *   学科・講師 → トップレイヤ
 *   カリキュラム → 学科の下
 *
 * データ入力:
 *   カリキュラムに講師をアサイン
 *   講師ごとに出講可能曜日・コマを入力
 *
 * 時間割配置は M2 で実施
 */

import { sqliteTable, text, integer, index, unique } from "drizzle-orm/sqlite-core";

// ─── 学科 (Departments) ──────────────────────────────────
// トップレイヤの設定項目。カリキュラムは学科の下にぶら下がる。

export const departments = sqliteTable("departments", {
  id: text("id").primaryKey(),
  /** 学科名 */
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── 講師 (Instructors) ──────────────────────────────────
// トップレイヤの設定項目。複数のカリキュラムを持つ。

export const instructors = sqliteTable("instructors", {
  id: text("id").primaryKey(),
  /** 講師名 */
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date())
    .notNull(),
});

// ─── カリキュラム (Curricula) ─────────────────────────────
// 学科の下に複数存在。複数の学科を持てる（学科合同授業対応）。

export const curricula = sqliteTable(
  "curricula",
  {
    id: text("id").primaryKey(),
    /** カリキュラム名 */
    name: text("name").notNull(),
    /** 所属学科ID (主学科 / 後方互換) */
    departmentId: text("department_id")
      .references(() => departments.id)
      .notNull(),
    /** コマ数 (この科目が必要とする総コマ数) */
    periods: integer("periods").notNull().default(1),
    /** 担当講師ID (nullable: 未アサイン状態を許容) */
    instructorId: text("instructor_id")
      .references(() => instructors.id),
    /** 所属タームID (nullable: 未設定を許容) */
    termId: text("term_id")
      .references(() => terms.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_curricula_department").on(table.departmentId),
    index("idx_curricula_instructor").on(table.instructorId),
  ]
);

// ─── カリキュラム × 学科 中間テーブル (Curriculum Departments) ──
// 学科合同授業対応: 1カリキュラムが複数の学科に所属可能。

export const curriculumDepartments = sqliteTable(
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

// ─── ターム (Terms) ──────────────────────────────────────
// カリキュラムの期間区分。ターム単位で配置を管理・決定する。

export const terms = sqliteTable(
  "terms",
  {
    id: text("id").primaryKey(),
    /** ターム名 (例: "前期", "2026年度前期") */
    name: text("name").notNull(),
    /** 開始日 (YYYY-MM-DD) */
    startDate: text("start_date").notNull(),
    /** 終了日 (YYYY-MM-DD) */
    endDate: text("end_date").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  }
);

// ─── カリキュラム配置 (Curriculum Placements) ────────────
// カリキュラムの時間割配置データ。ターム単位で管理。
// 自動配置・手動配置の結果をDBに保存し、入れ替え調整後にプラン化する。

export const curriculumPlacements = sqliteTable(
  "curriculum_placements",
  {
    id: text("id").primaryKey(),
    /** タームID */
    termId: text("term_id")
      .references(() => terms.id)
      .notNull(),
    /** カリキュラムID */
    curriculumId: text("curriculum_id")
      .references(() => curricula.id)
      .notNull(),
    /** 曜日 (0=月, 1=火, ..., 6=日) */
    day: integer("day").notNull(),
    /** コマ (0始まり) */
    period: integer("period").notNull(),
    /** 教室ID (nullable) */
    roomId: text("room_id"),
    /** 配置候補数 (自動配置時のスロット候補数) */
    candidateCount: integer("candidate_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_placement_term").on(table.termId),
    index("idx_placement_curriculum").on(table.curriculumId),
    unique("unique_placement_slot").on(table.termId, table.day, table.period, table.roomId),
  ]
);

// ─── 出講可能スロット (Instructor Available Slots) ────────
// 講師ごとに「どの曜日の何コマ目に出講可能か」を管理。
// 1行 = 1つの曜日 × 複数のコマ番号

export const instructorAvailableSlots = sqliteTable(
  "instructor_available_slots",
  {
    id: text("id").primaryKey(),
    /** 講師ID */
    instructorId: text("instructor_id")
      .references(() => instructors.id)
      .notNull(),
    /**
     * 曜日 (0=月, 1=火, 2=水, 3=木, 4=金, 5=土, 6=日)
     */
    day: integer("day").notNull(),
    /**
     * 出講可能なコマ番号の配列
     * 例: [1, 2, 3] → 1限・2限・3限が出講可能
     */
    periods: text("periods", { mode: "json" }).$type<number[]>().notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .$defaultFn(() => new Date())
      .notNull(),
  },
  (table) => [
    index("idx_available_slots_instructor").on(table.instructorId),
  ]
);
