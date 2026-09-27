// @implements AT-SPRINT-CHAT-INTEGRATION
import type { IntakeReview } from "./contracts.js";

/** Required fields cannot disappear just because an LLM forgot to ask about them. */
export function requireIntakeInformation(review: IntakeReview): IntakeReview {
  const missing = [
    ...(!review.purpose.trim() ? ["何のための変更か、目的を教えてください。"] : []),
    ...(!review.change.trim() ? ["変更する内容・範囲を教えてください。"] : []),
    ...(!review.acceptance.length ? ["完了と判断できる条件を教えてください。"] : []),
  ];
  return { ...review, questions: [...new Set([...missing, ...review.questions])].slice(0, 20) };
}
