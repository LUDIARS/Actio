/**
 * タスク一覧のキーセットページ分けの並び順と「続き」条件 (spec/feature/task-list-api.md)。
 *
 * - default: updated_at desc, id desc
 * - personal: status 順 (未着手→進行中→完了→その他) asc, 期限 asc (期限なしは最後),
 *   created_at desc, id desc
 *
 * どちらも id を最後に置くので並びは全順序になり、 前ページ最後の行のキーより後ろだけを
 * 引けば行の重複・抜けが起きない (offset は使わない)。
 */

import { and, asc, desc, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { schema } from "./connection.js";

export type TaskListSort = "default" | "personal";

export type TaskListCursorKey =
  | { sort: "default"; updatedAt: number; id: string }
  | { sort: "personal"; rank: number; deadline: number | null; createdAt: number; id: string };

/** キーを作るのに要る行の列 */
export interface TaskListKeyRow {
  id: string;
  status: string;
  deadline: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PERSONAL_STATUS_RANK: Record<string, number> = {
  open: 0, todo: 0, in_progress: 1, doing: 1, done: 2,
};

/** 個人タスクボードの status 順 (SQL 側の PERSONAL_STATUS_ORDER と同じ対応) */
export function personalStatusRank(status: string): number {
  return PERSONAL_STATUS_RANK[status] ?? 3;
}

// 個人タスクボードの並び: open/todo→0, in_progress/doing→1, done→2, その他→3。
export const PERSONAL_STATUS_ORDER = sql`CASE ${schema.tasks.status}
  WHEN 'open' THEN 0 WHEN 'todo' THEN 0
  WHEN 'in_progress' THEN 1 WHEN 'doing' THEN 1
  WHEN 'done' THEN 2 ELSE 3 END`;

// 期限なしを最後に回す (方言ごとの NULLS LAST 差を避けるため明示の列にする)
const DEADLINE_NULL_LAST = sql`CASE WHEN ${schema.tasks.deadline} IS NULL THEN 1 ELSE 0 END`;

export function taskListOrder(sort: TaskListSort): SQL[] {
  const t = schema.tasks;
  if (sort === "personal") {
    return [PERSONAL_STATUS_ORDER, DEADLINE_NULL_LAST, asc(t.deadline), desc(t.createdAt), desc(t.id)];
  }
  return [desc(t.updatedAt), desc(t.id)];
}

export function taskListCursorKeyOf(row: TaskListKeyRow, sort: TaskListSort): TaskListCursorKey {
  if (sort === "personal") {
    return {
      sort,
      rank: personalStatusRank(row.status),
      deadline: row.deadline ? row.deadline.getTime() : null,
      createdAt: row.createdAt.getTime(),
      id: row.id,
    };
  }
  return { sort, updatedAt: row.updatedAt.getTime(), id: row.id };
}

/** キーの行より並び順で後ろにある行だけを選ぶ条件 */
export function taskListAfterCondition(key: TaskListCursorKey): SQL {
  const t = schema.tasks;
  if (key.sort === "default") {
    const updatedAt = new Date(key.updatedAt);
    return or(lt(t.updatedAt, updatedAt), and(eq(t.updatedAt, updatedAt), lt(t.id, key.id))) as SQL;
  }
  const sameRank = sql`${PERSONAL_STATUS_ORDER} = ${key.rank}`;
  const branches: SQL[] = [sql`${PERSONAL_STATUS_ORDER} > ${key.rank}`];
  let sameDeadline: SQL;
  if (key.deadline === null) {
    sameDeadline = isNull(t.deadline);
  } else {
    const deadline = new Date(key.deadline);
    branches.push(and(sameRank, or(isNull(t.deadline), gt(t.deadline, deadline))) as SQL);
    sameDeadline = eq(t.deadline, deadline);
  }
  const createdAt = new Date(key.createdAt);
  branches.push(and(sameRank, sameDeadline, lt(t.createdAt, createdAt)) as SQL);
  branches.push(and(sameRank, sameDeadline, eq(t.createdAt, createdAt), lt(t.id, key.id)) as SQL);
  return or(...branches) as SQL;
}
