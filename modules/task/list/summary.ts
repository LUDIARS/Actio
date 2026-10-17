import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:160c11d0 */
import augurContract_2b52f0d5 from '../../../contracts/task-summary.contract.ts'; /* augur-inject:contract-predicate:2be97b97 */
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
// @ts-expect-error augur-inject
toTaskSummary = contract(toTaskSummary, { ...augurContract_2b52f0d5, contractId: 'C-20', mode: 'observe', sample: 1, where: 'modules/task/list/summary.ts:15', rule: 'contract-wrap', id: '2b52f0d5' }); /* augur-inject:contract-wrap:2b52f0d5 */
