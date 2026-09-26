import { contract } from '../contract-runtime.js'; /* augur-inject:import:557dc488 */
import augurContract_3f31162e from '../../contracts/should-sync-schema.contract.ts'; /* augur-inject:contract-predicate:50676790 */
/**
 * Cernere schema sync を実行するかの判定 (純関数)。
 *
 * ローカルモードは Cernere に project を持たないので同期しない。公開配備で
 * CERNERE_URL だけあって project 資格情報が欠けるときも throw せずスキップするが、
 * 設定漏れを見逃さないよう warn で知らせる。
 */

export interface SchemaSyncInput {
  localMode: boolean;
  cernereUrl: string;
  clientId: string;
  clientSecret: string;
}

export type SchemaSyncSkipReason = "local-mode" | "no-cernere-url" | "missing-credentials";

export type SchemaSyncDecision =
  | { sync: true }
  | { sync: false; reason: SchemaSyncSkipReason; level: "info" | "warn"; message: string };

/** @implements SPEC-SCHEMA-SYNC-SKIP */
export function shouldSyncSchema(input: SchemaSyncInput): SchemaSyncDecision {
  if (input.localMode) {
    return {
      sync: false,
      reason: "local-mode",
      level: "info",
      message: "[plugin] ローカルモードのため schema sync をスキップ",
    };
  }
  if (!input.cernereUrl) {
    return {
      sync: false,
      reason: "no-cernere-url",
      level: "info",
      message: "[plugin] CERNERE_URL 未設定 — schema sync をスキップ",
    };
  }
  if (!input.clientId || !input.clientSecret) {
    return {
      sync: false,
      reason: "missing-credentials",
      level: "warn",
      message:
        "[plugin] Cernere project 資格情報 (CERNERE_PROJECT_CLIENT_ID / CERNERE_PROJECT_CLIENT_SECRET) が未設定 — schema sync をスキップ",
    };
  }
  return { sync: true };
}
// @ts-expect-error augur-inject
shouldSyncSchema = contract(shouldSyncSchema, { ...augurContract_3f31162e, contractId: 'C-1', mode: 'observe', sample: 1, where: 'src/plugins/schema-sync-policy.ts:22', rule: 'contract-wrap', id: '3f31162e' }); /* augur-inject:contract-wrap:3f31162e */
