/**
 * tasks.project_id 新設 + completed_at 単体 INDEX (Memoria task id 552)
 *
 * GLAB×Calliope PM 連携 (2026-07-17 neco 最終裁定)。
 * spec/tasks/2026-07-17-01-glab-project-tasks.md の完了条件のうち
 * スキーマレベルの要件 (project_id カラム + INDEX、completed_at 単体 INDEX)
 * を直接 PRAGMA で検証する。
 */
import { describe, it, expect, beforeAll } from "vitest";
import Database from "better-sqlite3";
import { resolve } from "path";
import { initTestDatabase } from "./helpers.js";

let sqlite: InstanceType<typeof Database>;

beforeAll(() => {
  initTestDatabase();
  const dbPath = process.env.DATABASE_PATH || resolve("data", "test.db");
  sqlite = new Database(dbPath);
});

interface ColumnInfo {
  name: string;
  notnull: number;
  type: string;
}

interface IndexInfo {
  name: string;
}

describe("tasks.project_id schema", () => {
  it("adds a nullable project_id text column", () => {
    const columns = sqlite.prepare("PRAGMA table_info(tasks)").all() as ColumnInfo[];
    const projectIdCol = columns.find((c) => c.name === "project_id");
    expect(projectIdCol).toBeDefined();
    expect(projectIdCol?.notnull).toBe(0); // nullable (FK なし、不透明参照)
  });

  it("does not add a foreign key on project_id (opaque reference, no project master)", () => {
    const fks = sqlite.prepare("PRAGMA foreign_key_list(tasks)").all() as Array<{ from: string }>;
    expect(fks.some((fk) => fk.from === "project_id")).toBe(false);
  });

  it("creates an index on project_id", () => {
    const indexes = sqlite.prepare("PRAGMA index_list(tasks)").all() as IndexInfo[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_task_project");
  });

  it("keeps existing kind/category/creator_type/estimated_minutes/completed_at columns intact", () => {
    const columns = sqlite.prepare("PRAGMA table_info(tasks)").all() as ColumnInfo[];
    const names = columns.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(["kind", "category", "creator_type", "estimated_minutes", "completed_at"])
    );
  });
});

describe("tasks.completed_at index (velocity Θ_p aggregation)", () => {
  it("creates a standalone index on completed_at", () => {
    const indexes = sqlite.prepare("PRAGMA index_list(tasks)").all() as IndexInfo[];
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_task_completed_at");

    const indexed = sqlite.prepare("PRAGMA index_info(idx_task_completed_at)").all() as Array<{ name: string }>;
    expect(indexed.map((c) => c.name)).toEqual(["completed_at"]);
  });
});
