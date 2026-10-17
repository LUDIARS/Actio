/**
 * limit + 1 行引いた結果から 1 ページ分と nextCursor を組み立てる。
 * 超過行があるときだけ次ページがあり、 カーソルはページ最後の行の並びキー。
 */

import { taskListCursorKeyOf, type TaskListKeyRow, type TaskListSort } from "../../../src/db/task-list-keyset.js";
import { encodeTaskListCursor } from "./cursor.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:16843d48 */
import augurContract_52f356c3 from '../../../contracts/task-list-page.contract.ts'; /* augur-inject:contract-predicate:1a042bc9 */

export interface TaskListPage<T> {
  tasks: T[];
  nextCursor: string | null;
}

export function buildTaskListPage<T extends TaskListKeyRow>(rows: T[], limit: number, sort: TaskListSort): TaskListPage<T> {
  if (rows.length <= limit) return { tasks: rows, nextCursor: null };
  const tasks = rows.slice(0, limit);
  return { tasks, nextCursor: encodeTaskListCursor(taskListCursorKeyOf(tasks[tasks.length - 1], sort)) };
}
// @ts-expect-error augur-inject
buildTaskListPage = contract(buildTaskListPage, { ...augurContract_52f356c3, contractId: 'C-21', mode: 'observe', sample: 1, where: 'modules/task/list/page.ts:14', rule: 'contract-wrap', id: '52f356c3' }); /* augur-inject:contract-wrap:52f356c3 */
