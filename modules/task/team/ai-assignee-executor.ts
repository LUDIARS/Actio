/**
 * AI メンバーを責任者にしたタスクの作業者をそろえる (純粋関数)。
 * spec/feature/task-integration/spec.md §4.4
 *
 * 責任者が AI メンバー (`ai:<call_name>`) のタスクは executor_type=ai / ai_executor=call_name にする。
 * 食い違う指定は黙って上書きせず誤りにする。
 */

import { aiMemberCallName } from "../../../src/auth/ai-member-id.js";
import type { ExecutorRequestFields, ExecutorValue } from "../validation/executor.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:0c722f78 */
import augurContract_db3750f6 from '../../../contracts/ai-assignee-executor.contract.ts'; /* augur-inject:contract-predicate:044c08c5 */

export interface AssigneeExecutorInput {
  /** 変更後の責任者。 */
  assigneeId: string | null;
  /** 変更前の責任者 (新規作成なら null)。 */
  previousAssigneeId: string | null;
  /** resolveExecutor が決めた値。 */
  executor: ExecutorValue;
  /** 呼び出し側が明示した項目 (渡されなかった項目は undefined)。 */
  requested: ExecutorRequestFields;
}

export function alignExecutorWithAssignee(input: AssigneeExecutorInput): { value: ExecutorValue; error?: string } {
  const callName = aiMemberCallName(input.assigneeId);
  if (callName !== null) {
    if (input.requested.executorType === "human") {
      return { value: input.executor, error: "executor_type must be ai when assignee_id is an AI member" };
    }
    if (typeof input.requested.aiExecutor === "string" && input.requested.aiExecutor !== callName) {
      return { value: input.executor, error: `ai_executor must be ${callName} when assignee_id is that AI member` };
    }
    return { value: { executorType: "ai", aiExecutor: callName } };
  }
  // AI メンバーから人間へ責任者を戻したとき、 そろえていた作業者だけを人間へ戻す。
  const previousCallName = aiMemberCallName(input.previousAssigneeId);
  const untouched = input.requested.executorType === undefined && input.requested.aiExecutor === undefined;
  if (previousCallName !== null && untouched
    && input.executor.executorType === "ai" && input.executor.aiExecutor === previousCallName) {
    return { value: { executorType: "human", aiExecutor: null } };
  }
  return { value: input.executor };
}
// @ts-expect-error augur-inject
alignExecutorWithAssignee = contract(alignExecutorWithAssignee, { ...augurContract_db3750f6, contractId: 'C-46', mode: 'observe', sample: 1, where: 'modules/task/team/ai-assignee-executor.ts:23', rule: 'contract-wrap', id: 'db3750f6' }); /* augur-inject:contract-wrap:db3750f6 */
