import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:160c11d0 */
import augurContract_b3e74f8f from '../../../contracts/task-summary.contract.ts'; /* augur-inject:contract-predicate:c7d47140 */
/**
 * 一覧に載せるタスク要約 (TaskSummary)。
 *
 * 既存 Task から本文 (description / requirements / completionEvidence / publicSummary) を
 * 除いたもの。 pluginPayload は残す (Cc taskflow が runs を読む)。 全文は GET /api/tasks/:id。
 * description は include=description のときだけ残す。
 */

const BODY_FIELDS = new Set(["description", "requirements", "completionEvidence", "publicSummary"]);

export type TaskSummary<T> = Omit<T, "description" | "requirements" | "completionEvidence" | "publicSummary"> & {
  description?: string | null;
};

export function toTaskSummary<T extends object>(task: T, includeDescription: boolean): TaskSummary<T> {
  const summary: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(task)) {
    if (!BODY_FIELDS.has(key)) summary[key] = value;
  }
  if (includeDescription) summary.description = (task as { description?: string | null }).description ?? null;
  return summary as TaskSummary<T>;
}

/** @implements AT-TASK-LIST-STALL */
export function summarizeTaskList<T extends object>(tasks: readonly T[], includeDescription: boolean): TaskSummary<T>[] {
  return tasks.map((task) => toTaskSummary(task, includeDescription));
}
// @ts-expect-error augur-inject
summarizeTaskList = contract(summarizeTaskList, { ...augurContract_b3e74f8f, contractId: 'C-27', mode: 'observe', sample: 1, where: 'modules/task/list/summary.ts:25', rule: 'contract-wrap', id: 'b3e74f8f' }); /* augur-inject:contract-wrap:b3e74f8f */
