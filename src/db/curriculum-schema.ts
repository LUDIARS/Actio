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

import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

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
