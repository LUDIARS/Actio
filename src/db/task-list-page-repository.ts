/**
 * タスク一覧のキーセットページ取得 (GET /api/tasks)。
 *
 * 一覧は要約だけ返すので、 大きくなりがちな本文列 (description / requirements /
 * completion_evidence / public_summary) は DB からも読まない。 description は
 * include=description を明示したときだけ読む。 limit + 1 行引いて次ページの有無を判断する。
 */

import { getTableColumns } from "drizzle-orm";
import { db, schema } from "./connection.js";
import type { tasks as taskTable } from "./schema.js";
import { buildTaskListConditions, combineTaskListConditions, type TaskListFilter } from "./task-list-conditions.js";
import { taskListAfterCondition, taskListOrder, type TaskListCursorKey, type TaskListSort } from "./task-list-keyset.js";

// connection の schema は方言で切り替わるため any。 行の型は正本の SQLite 定義から取る
type TaskRow = typeof taskTable.$inferSelect;

/** 一覧に載せない本文列 */
export const TASK_BODY_COLUMNS = ["description", "requirements", "completionEvidence", "publicSummary"] as const;
type TaskBodyColumn = (typeof TASK_BODY_COLUMNS)[number];

export type TaskListRow = Omit<TaskRow, TaskBodyColumn> & { description?: string | null };

export interface TaskListPageRequest {
  filter: TaskListFilter;
  sort: TaskListSort;
  /** 1 ページの件数。 実際には limit + 1 行引く */
  limit: number;
  after: TaskListCursorKey | null;
  includeDescription: boolean;
}

function summaryColumns(includeDescription: boolean) {
  const { description, requirements, completionEvidence, publicSummary, ...rest } = getTableColumns(schema.tasks);
  void requirements; void completionEvidence; void publicSummary;
  return includeDescription ? { ...rest, description } : rest;
}

export const taskListPageRepo = {
  /** 並び順で after より後ろの行を最大 limit + 1 件返す (limit 超過分は次ページ判定用) */
  async listPage(request: TaskListPageRequest): Promise<TaskListRow[]> {
    const conditions = buildTaskListConditions(request.filter);
    if (request.after) conditions.push(taskListAfterCondition(request.after));
    const where = combineTaskListConditions(conditions);
    const query = db.select(summaryColumns(request.includeDescription)).from(schema.tasks);
    const rows = await (where ? query.where(where) : query)
      .orderBy(...taskListOrder(request.sort))
      .limit(request.limit + 1);
    return rows as TaskListRow[];
  },
};
