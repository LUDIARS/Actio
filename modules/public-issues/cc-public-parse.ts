/**
 * Cc の公開読み出し API の応答から、 公開してよい項目だけを取り出す (spec/feature/public-issues.md §5)。
 * 応答に原文・受付口・プラットフォームの id・判定の理由が混ざっていても、 ここで落とす (許可した項目だけを拾う)。
 * 形が崩れていれば null (判定できなければ出さない)。
 */
import type { BountySeverity, PublicBountyReport } from "./types.js";
import { isPublicProjectCode } from "./project-code.js";
import { contract } from '../../src/contract-runtime.js'; /* augur-inject:import:7d804d2d */
import augurContract_cf0ac5a2 from '../../contracts/public-reports-parse.contract.ts'; /* augur-inject:contract-predicate:cb8b6f6e */

const SEVERITIES: ReadonlySet<string> = new Set(["s1", "s2", "s3", "s4"]);
const TEXT_LIMIT = 2000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, TEXT_LIMIT) : null;
}

function timestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function tokens(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function severity(value: unknown): BountySeverity | null {
  return typeof value === "string" && SEVERITIES.has(value) ? (value as BountySeverity) : null;
}

/** `GET /v1/projects/public-issues`: `{ projects: ["At", ...] }` (要素は `{ code }` でもよい) */
export function parsePublicProjectCodes(payload: unknown): string[] | null {
  if (!isRecord(payload)) return null;
  const list = Array.isArray(payload.projects) ? payload.projects : Array.isArray(payload.codes) ? payload.codes : null;
  if (!list) return null;
  const codes = list
    .map((entry: unknown) => (isRecord(entry) ? entry.code : entry))
    .filter(isPublicProjectCode);
  return [...new Set(codes)];
}

function parseReport(entry: unknown): PublicBountyReport | null {
  if (!isRecord(entry)) return null;
  const reportId = text(entry.id ?? entry.report_id);
  const title = text(entry.public_title);
  if (!reportId || !title) return null;
  return {
    reportId,
    title,
    summary: text(entry.public_summary),
    severity: severity(entry.severity),
    status: text(entry.status),
    publicName: text(entry.public_name),
    rewardTokens: tokens(entry.reward_tokens),
    receivedAt: timestamp(entry.received_at),
    deployedAt: timestamp(entry.deployed_at),
  };
}

/** `GET /v1/bounty/public-reports?project=<code>`: `{ reports: [...] }`。 id か公開用の題名が無い行は出さない */
export function parsePublicReports(payload: unknown): PublicBountyReport[] | null {
  if (!isRecord(payload) || !Array.isArray(payload.reports)) return null;
  return payload.reports.map(parseReport).filter((report): report is PublicBountyReport => report !== null);
}
// @ts-expect-error augur-inject
parsePublicReports = contract(parsePublicReports, { ...augurContract_cf0ac5a2, contractId: 'C-14', mode: 'observe', sample: 1, where: 'modules/public-issues/cc-public-parse.ts:66', rule: 'contract-wrap', id: 'cf0ac5a2' }); /* augur-inject:contract-wrap:cf0ac5a2 */
