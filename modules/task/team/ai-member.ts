/**
 * チームメンバーの表示形 (spec/feature/team-task/spec.md §3.1)。
 * 人間と AI メンバーを `kind` で区別して返す。 個人データは持たない (id と role だけ)。
 */

import { aiMemberCallName } from "../../../src/auth/ai-member-id.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:ce1eb4f3 */
import augurContract_dfa89309 from '../../../contracts/team-member-view.contract.ts'; /* augur-inject:contract-predicate:c20c93cd */

export interface TeamMemberView {
  userId: string;
  role: string;
  kind: "human" | "ai";
  /** AI メンバーだけ。 Cc の delegation template の call_name。 */
  callName: string | null;
}

export function toTeamMemberView(row: { userId: string; role: string }): TeamMemberView {
  const callName = aiMemberCallName(row.userId);
  return { userId: row.userId, role: row.role, kind: callName === null ? "human" : "ai", callName };
}
// @ts-expect-error augur-inject
toTeamMemberView = contract(toTeamMemberView, { ...augurContract_dfa89309, contractId: 'C-47', mode: 'observe', sample: 1, where: 'modules/task/team/ai-member.ts:16', rule: 'contract-wrap', id: 'dfa89309' }); /* augur-inject:contract-wrap:dfa89309 */
