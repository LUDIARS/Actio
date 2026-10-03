/**
 * Excubitor secret-agent から Actio の secret を受け取る (`POST /api/v1/secrets/resolve`)。
 * 値は戻り値 (プロセスメモリ) だけで扱い、環境変数にもファイルにも書かない。
 */
import type { SecretSource } from "../secret-source.js";
import { parseSecretSource } from "../secret-source.js";
import { excubitorAgentToken, excubitorFetch } from "./endpoint.js";
import { contract } from '../../contract-runtime.js'; /* augur-inject:import:598b0185 */
import augurContract_8a940855 from '../../../contracts/vault-secret-response.contract.ts'; /* augur-inject:contract-predicate:8fe70f60 */

/** Excubitor catalog 上の Actio のサービスコード。マッピングもこの名前で登録する。 */
export const ACTIO_SERVICE_CODE = "actio";

export class SecretAgentError extends Error {
  constructor(
    readonly code: "unauthorized" | "key_not_allowed" | "no_mapping" | "no_identity" | "fetch_failed" | "bad_response" | "source_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "SecretAgentError";
  }
}

const STATUS_CODES: Record<number, SecretAgentError["code"]> = { 401: "unauthorized", 403: "key_not_allowed", 404: "no_mapping", 503: "no_identity" };

interface ResolveResponse { secrets?: unknown; source?: unknown }

/**
 * Vault 由来の要求キー部分集合だけを受け取る。ローカル設定は要求自体を拒否する。
 */
export async function resolveSecretsFromExcubitor(source: SecretSource): Promise<Map<string, string>> {
  if (!parseSecretSource(source.keys.join(",")).ok) {
    throw new SecretAgentError("key_not_allowed", "Invalid secret-agent key selection");
  }
  const response = await excubitorFetch("/api/v1/secrets/resolve", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${excubitorAgentToken()}` },
    body: JSON.stringify({ service: ACTIO_SERVICE_CODE, keys: source.keys }),
  });
  if (!response.ok) {
    // The body may describe the upstream failure in detail; keep only the classification.
    throw new SecretAgentError(STATUS_CODES[response.status] ?? "fetch_failed", `Excubitor secret-agent answered ${response.status}`);
  }
  const body = await response.json().catch(() => null) as ResolveResponse | null;
  if (!body || typeof body.secrets !== "object" || body.secrets === null || Array.isArray(body.secrets)) {
    throw new SecretAgentError("bad_response", "Excubitor secret-agent response has no secrets object");
  }
  if (body.source !== "vault") {
    throw new SecretAgentError("source_mismatch", "Excubitor secret-agent response is not from Vault");
  }
  const secrets = new Map<string, string>();
  for (const [key, value] of Object.entries(body.secrets)) {
    if (typeof value !== "string" || !source.keys.includes(key)) {
      throw new SecretAgentError("bad_response", "Excubitor secret-agent returned an invalid secret entry");
    }
    secrets.set(key, value);
  }
  return secrets;
}
// @ts-expect-error augur-inject
resolveSecretsFromExcubitor = contract(resolveSecretsFromExcubitor, { ...augurContract_8a940855, contractId: 'C-2', mode: 'observe', sample: 1, where: 'src/config/excubitor/secret-agent-client.ts:29', rule: 'contract-wrap', id: '8a940855' }); /* augur-inject:contract-wrap:8a940855 */
