/**
 * Excubitor secret-agent から Actio の secret を受け取る (`POST /api/v1/secrets/resolve`)。
 * 値は戻り値 (プロセスメモリ) だけで扱い、環境変数にもファイルにも書かない。
 */
import type { SecretSource } from "../secret-source.js";
import { excubitorAgentToken, excubitorFetch } from "./endpoint.js";

/** Excubitor catalog 上の Actio のサービスコード。マッピングもこの名前で登録する。 */
export const ACTIO_SERVICE_CODE = "actio";

export class SecretAgentError extends Error {
  constructor(
    readonly code: "unauthorized" | "no_mapping" | "no_identity" | "fetch_failed" | "bad_response" | "source_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "SecretAgentError";
  }
}

const STATUS_CODES: Record<number, SecretAgentError["code"]> = { 401: "unauthorized", 404: "no_mapping", 503: "no_identity" };

interface ResolveResponse { secrets?: unknown; project_id?: unknown; environment?: unknown }

/**
 * 取得元に指定した project の値を受け取る。Excubitor 側のマッピングが別の project を
 * 指していたら受け取らない (設定した覚えのない project の値で動かないため)。
 */
export async function resolveSecretsFromExcubitor(source: SecretSource): Promise<Map<string, string>> {
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
  if (!body || typeof body.secrets !== "object" || body.secrets === null) {
    throw new SecretAgentError("bad_response", "Excubitor secret-agent response has no secrets object");
  }
  if (body.project_id !== source.projectId || body.environment !== source.environment) {
    throw new SecretAgentError("source_mismatch", "Excubitor maps actio to a different Infisical project or environment");
  }
  const secrets = new Map<string, string>();
  for (const [key, value] of Object.entries(body.secrets)) {
    if (typeof value === "string" && source.keys.includes(key)) secrets.set(key, value);
  }
  return secrets;
}
