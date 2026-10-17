/**
 * タスク一覧の絞り込み条件 (GET /api/tasks)。
 *
 * taskRepo.list (全件) と taskListPageRepo.listPage (キーセットページ) が同じ条件を使う。
 * 方言差 (LIKE の ESCAPE 句・文字列連結) はここで吸収する。
 */

import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { dialect, schema } from "./connection.js";

export interface TaskListFilter {
  ownerId?: string;
  assigneeId?: string;
  groupId?: string;
  /** 外部プロジェクトの不透明参照 (EducationLab glab_project.id 等)。 ?project=<id> フィルタ用 */
  projectId?: string;
  teamId?: string;
  lane?: string;
  sprintId?: string;
  status?: string;
  /** status のカンマ区切り複数指定 (いずれかに一致) */
  statuses?: string[];
  pluginId?: string;
  /** 種別フィルタ: "task" / "goal" / "all"(両方)。 省略時は全件 (互換) */
  kind?: string;
  /** 作業者種別: "human" / "ai" (task-integration §4.3) */
  executorType?: string;
  /** deadline <= dueBefore */
  dueBefore?: Date;
  /** deadline >= dueAfter */
  dueAfter?: Date;
  /** updated_at >= updatedSince */
  updatedSince?: Date;
  /** title の部分一致 (大文字小文字無視) */
  q?: string;
  /** カンマ区切り category のどれかが一致 */
  category?: string;
  /** 担当者 ID の一致 (scope=assigned とは独立に指定できる) */
  assignee?: string;
  /**
   * 並び順。 "personal" = 個人タスクボード用
   * (status todo→doing→done, 次に期限 昇順 nulls last, 次に作成日時 降順)。
   * 省略時は従来どおり作成日時 降順 (ページ取得では updated_at 降順)。
   */
  sort?: "personal";
}

/** LIKE の特殊文字 (\ % _) を \ でエスケープする */
function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// MySQL は \ が既定のエスケープ文字で、 ESCAPE '\' はかえって構文を壊す
function likeEscaped(target: SQL, pattern: string): SQL {
  return dialect === "mysql"
    ? sql`${target} LIKE ${pattern}`
    : sql`${target} LIKE ${pattern} ESCAPE '\\'`;
}

function titleContains(q: string): SQL {
  return likeEscaped(sql`LOWER(${schema.tasks.title})`, `%${escapeLike(q.toLowerCase())}%`);
}

// category は "開発, 学習" のようなカンマ区切り。 空白を除いて ",開発,学習," に対し ",開発," を探す
function categoryIncludes(category: string): SQL {
  const token = category.replace(/\s+/g, "");
  const column = schema.tasks.category;
  const normalized = dialect === "mysql"
    ? sql`CONCAT(',', REPLACE(${column}, ' ', ''), ',')`
    : sql`(',' || REPLACE(${column}, ' ', '') || ',')`;
  return likeEscaped(normalized, `%,${escapeLike(token)},%`);
}

export function buildTaskListConditions(filter: TaskListFilter): SQL[] {
  const t = schema.tasks;
  const conditions: SQL[] = [];
  if (filter.ownerId) conditions.push(eq(t.ownerId, filter.ownerId));
  if (filter.assigneeId) conditions.push(eq(t.assigneeId, filter.assigneeId));
  if (filter.assignee) conditions.push(eq(t.assigneeId, filter.assignee));
  if (filter.groupId) conditions.push(eq(t.groupId, filter.groupId));
  if (filter.projectId) conditions.push(eq(t.projectId, filter.projectId));
  if (filter.teamId) conditions.push(eq(t.teamId, filter.teamId));
  if (filter.lane) conditions.push(eq(t.lane, filter.lane));
  if (filter.sprintId) conditions.push(eq(t.sprintId, filter.sprintId));
  if (filter.status) conditions.push(eq(t.status, filter.status));
  if (filter.statuses?.length) conditions.push(inArray(t.status, filter.statuses));
  if (filter.pluginId) conditions.push(eq(t.pluginId, filter.pluginId));
  if (filter.kind && filter.kind !== "all") conditions.push(eq(t.kind, filter.kind));
  if (filter.executorType) conditions.push(eq(t.executorType, filter.executorType));
  if (filter.dueBefore) conditions.push(lte(t.deadline, filter.dueBefore));
  if (filter.dueAfter) conditions.push(gte(t.deadline, filter.dueAfter));
  if (filter.updatedSince) conditions.push(gte(t.updatedAt, filter.updatedSince));
  if (filter.q) conditions.push(titleContains(filter.q));
  if (filter.category) conditions.push(categoryIncludes(filter.category));
  return conditions;
}

/** 条件が無ければ undefined (where を付けない) */
export function combineTaskListConditions(conditions: SQL[]): SQL | undefined {
  return conditions.length ? and(...conditions) : undefined;
}
