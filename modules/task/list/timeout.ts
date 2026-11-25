import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:992c8f0e */
import augurContract_3808c13c from '../../../contracts/task-list-timeout-status.contract.ts'; /* augur-inject:contract-predicate:2593c88a */
export class TaskListLoadTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Task list load exceeded ${timeoutMs}ms`);
    this.name = "TaskListLoadTimeoutError";
  }
}

function isPostgresQueryCanceled(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "57014";
}

export function taskListTimeoutStatus(error: unknown): 503 | undefined {
  // Drizzle wraps driver errors with the original PostgreSQL error as their cause.
  if (error instanceof TaskListLoadTimeoutError
    || isPostgresQueryCanceled(error)
    || (error instanceof Error && isPostgresQueryCanceled(error.cause))) return 503;
  return undefined;
}
// @ts-expect-error augur-inject
taskListTimeoutStatus = contract(taskListTimeoutStatus, { ...augurContract_3808c13c, contractId: 'C-25', mode: 'observe', sample: 1, where: 'modules/task/list/timeout.ts:12', rule: 'contract-wrap', id: '3808c13c' }); /* augur-inject:contract-wrap:3808c13c */
