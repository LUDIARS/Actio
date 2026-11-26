/**
 * 通知の宛先から AI メンバーを分ける (純粋関数)。 spec/feature/task-integration/spec.md §2.6
 *
 * 人間あての通知を AI 責任者には送らない。 AI だけに宛てた通知は送らずに理由を付けて記録する。
 */

import { isAiMemberId } from "../../../src/auth/ai-member-id.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:db31937f */
import augurContract_406a289b from '../../../contracts/ai-recipients.contract.ts'; /* augur-inject:contract-predicate:971ae1aa */

export interface AiRecipientRoute {
  /** false なら配送せず、 送信箱に skipped として記録する。 */
  deliver: boolean;
  recipientIds: string[];
  skippedAiIds: string[];
  reason: string | null;
}

export function routeAiRecipients(intent: { recipientIds: readonly string[] }): AiRecipientRoute {
  const recipientIds = intent.recipientIds.filter((id) => !isAiMemberId(id));
  const skippedAiIds = intent.recipientIds.filter((id) => isAiMemberId(id));
  if (skippedAiIds.length > 0 && recipientIds.length === 0) {
    return {
      deliver: false, recipientIds, skippedAiIds,
      reason: `recipient is an AI member (${skippedAiIds.join(", ")}); human notification was not sent`,
    };
  }
  return { deliver: true, recipientIds, skippedAiIds, reason: null };
}
// @ts-expect-error augur-inject
routeAiRecipients = contract(routeAiRecipients, { ...augurContract_406a289b, contractId: 'C-49', mode: 'observe', sample: 1, where: 'modules/task/team/ai-recipients.ts:17', rule: 'contract-wrap', id: '406a289b' }); /* augur-inject:contract-wrap:406a289b */
