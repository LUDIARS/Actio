import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:ea68fab3 */
import augurContract_53b3a47f from '../../../contracts/public-issue-fields.contract.ts'; /* augur-inject:contract-predicate:572644d9 */
/**
 * パブリックイシューの公開設定 (public_hidden / public_summary) の入力検証。
 * spec/feature/public-issues.md §3。camelCase / snake_case のどちらでも受ける。
 */

export const PUBLIC_SUMMARY_MAX_LENGTH = 1000;

export interface PublicIssueFields {
  /** undefined = 指定なし (更新しない) */
  publicHidden?: boolean;
  /** undefined = 指定なし、null = 要約を消す */
  publicSummary?: string | null;
}

export type PublicIssueFieldsResult =
  | { ok: true; value: PublicIssueFields }
  | { ok: false; error: string };

function pick(body: Record<string, unknown>, camel: string, snake: string): unknown {
  return body[camel] !== undefined ? body[camel] : body[snake];
}

export function readPublicIssueFields(body: Record<string, unknown>): PublicIssueFieldsResult {
  const value: PublicIssueFields = {};
  const hidden = pick(body, "publicHidden", "public_hidden");
  if (hidden !== undefined) {
    if (typeof hidden !== "boolean") return { ok: false, error: "public_hidden must be a boolean" };
    value.publicHidden = hidden;
  }
  const summary = pick(body, "publicSummary", "public_summary");
  if (summary !== undefined) {
    if (summary !== null && typeof summary !== "string") return { ok: false, error: "public_summary must be a string or null" };
    const trimmed = typeof summary === "string" ? summary.trim() : null;
    if (trimmed !== null && trimmed.length > PUBLIC_SUMMARY_MAX_LENGTH) {
      return { ok: false, error: `public_summary must be at most ${PUBLIC_SUMMARY_MAX_LENGTH} characters` };
    }
    value.publicSummary = trimmed || null;
  }
  return { ok: true, value };
}
// @ts-expect-error augur-inject
readPublicIssueFields = contract(readPublicIssueFields, { ...augurContract_53b3a47f, contractId: 'C-17', mode: 'observe', sample: 1, where: 'modules/task/validation/public-issue-fields.ts:23', rule: 'contract-wrap', id: '53b3a47f' }); /* augur-inject:contract-wrap:53b3a47f */
