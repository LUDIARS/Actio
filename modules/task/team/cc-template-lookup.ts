/**
 * Cc の delegation template の存在確認 (spec/feature/team-task/spec.md §3.1)。
 * `GET {CONCORDIA_URL}/v1/delegation/templates/:identifier`
 *
 * Cc に届かないときは「無い」と見なさず、 不達として呼び出し側へ返す (無言 fallback 禁止)。
 */

import { isAiCallName } from "../../../src/auth/ai-member-id.js";
import { contract } from '../../../src/contract-runtime.js'; /* augur-inject:import:238f135a */
import augurContract_26533646 from '../../../contracts/cc-template-lookup.contract.ts'; /* augur-inject:contract-predicate:95b1b85c */

export type TemplateLookupOutcome = "found" | "missing" | "unavailable";

export type TemplateLookup =
  | { outcome: "found"; callName: string; title: string | null }
  | { outcome: "missing" }
  | { outcome: "unavailable"; reason: string };

const LOOKUP_TIMEOUT_MS = 10_000;

export function interpretTemplateLookup(status: number): TemplateLookupOutcome {
  if (status === 200) return "found";
  if (status === 404) return "missing";
  return "unavailable";
}
// @ts-expect-error augur-inject
interpretTemplateLookup = contract(interpretTemplateLookup, { ...augurContract_26533646, contractId: 'C-50', mode: 'observe', sample: 1, where: 'modules/task/team/cc-template-lookup.ts:19', rule: 'contract-wrap', id: '26533646' }); /* augur-inject:contract-wrap:26533646 */

/** エラー文には URL やネットワーク例外の中身を入れない (接続先に資格情報が含まれることがあるため)。 */
export async function lookupDelegationTemplate(
  baseUrl: string,
  identifier: string,
  fetchImpl: typeof fetch = fetch,
): Promise<TemplateLookup> {
  const base = baseUrl.replace(/\/+$/, "");
  if (!base) return { outcome: "unavailable", reason: "CONCORDIA_URL is not configured" };
  let response: Response;
  try {
    response = await fetchImpl(`${base}/v1/delegation/templates/${encodeURIComponent(identifier)}`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
  } catch {
    return { outcome: "unavailable", reason: "Concordia is unreachable" };
  }
  const outcome = interpretTemplateLookup(response.status);
  if (outcome === "missing") return { outcome };
  if (outcome === "unavailable") return { outcome, reason: `Concordia returned HTTP ${response.status}` };
  const body = await response.json().catch(() => null) as { template?: { call_name?: unknown; title?: unknown } } | null;
  const callName = body?.template?.call_name;
  if (!isAiCallName(callName)) return { outcome: "unavailable", reason: "Concordia returned a template without a usable call_name" };
  return { outcome: "found", callName, title: typeof body?.template?.title === "string" ? body.template.title : null };
}
