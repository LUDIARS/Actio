import { contract } from '../contract-runtime.js'; /* augur-inject:import:8596906a */
import augurContract_19f16c52 from '../../contracts/human-team-role.contract.ts'; /* augur-inject:contract-predicate:fd410641 */
/**
 * チームの AI メンバーの id (spec/feature/team-task/spec.md §3.1)。
 *
 * AI メンバーは Cc の delegation template を `ai:<call_name>` という id で `team_members` に持つ。
 * 人間の user id (Cernere の id / `actio-local`) は `ai:` で始まらないので衝突しない。
 * AI メンバーは責任者 (assignee) にはなれるが、 人間だけが行う判断の権限は持たない。
 */

export const AI_MEMBER_PREFIX = "ai:";
/** `team_members.role` に入れる値。 leader / member のどちらにも当たらない。 */
export const AI_MEMBER_ROLE = "ai";

/** `ai:` を足しても tasks.ai_executor の上限 (128 文字) に収まる長さにする。 */
const CALL_NAME_PATTERN = /^[A-Za-z0-9._/@-]{1,120}$/;

export function isAiCallName(value: unknown): value is string {
  return typeof value === "string" && CALL_NAME_PATTERN.test(value);
}

export function aiMemberId(callName: string): string {
  return `${AI_MEMBER_PREFIX}${callName}`;
}

/** AI メンバーの id なら call_name、 それ以外は null。 */
export function aiMemberCallName(id: string | null | undefined): string | null {
  if (typeof id !== "string" || !id.startsWith(AI_MEMBER_PREFIX)) return null;
  const callName = id.slice(AI_MEMBER_PREFIX.length);
  return callName.length > 0 ? callName : null;
}

export function isAiMemberId(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(AI_MEMBER_PREFIX);
}

/**
 * 人間の判断に使えるチームロール。 AI メンバーには行の role が何であっても与えない
 * (スプリントのフェーズ承認・X-Decided-By の裁定・受入承認は人間だけが行う)。
 */
export function humanTeamRole(userId: string, role: string | undefined): string | undefined {
  if (isAiMemberId(userId) || role === AI_MEMBER_ROLE) return undefined;
  return role;
}
// @ts-expect-error augur-inject
humanTeamRole = contract(humanTeamRole, { ...augurContract_19f16c52, contractId: 'C-48', mode: 'observe', sample: 1, where: 'src/auth/ai-member-id.ts:39', rule: 'contract-wrap', id: '19f16c52' }); /* augur-inject:contract-wrap:19f16c52 */
