/**
 * Excubitor の「サービス別 Infisical マッピング」へ Actio 自身の取得元を登録する。
 *
 * 使うのは 1 サービス分だけを差し替える口 (`PUT /api/v1/config/infisical/services/actio`)。
 * マップ全体を置き換える UI 用 API は使わない (他サービスの行を消せてしまうため)。
 */
import type { SecretSource } from "../secret-source.js";
import { excubitorFetch } from "./endpoint.js";
import { ACTIO_SERVICE_CODE } from "./secret-agent-client.js";

export class MappingRegistrationError extends Error {
  constructor(readonly code: "unsupported" | "rejected" | "failed", message: string) {
    super(message);
    this.name = "MappingRegistrationError";
  }
}

export async function registerSecretSourceWithExcubitor(source: SecretSource): Promise<void> {
  const response = await excubitorFetch(`/api/v1/config/infisical/services/${ACTIO_SERVICE_CODE}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      project_id: source.projectId,
      environment: source.environment,
      // Actio pulls through the secret-agent at startup; spawn-time env injection stays off.
      inject: false,
      prefix: "",
      include: source.keys,
    }),
  });
  if (response.ok) return;
  // 404 means an Excubitor build without the per-service route; the mapping must then be set in its Config UI.
  if (response.status === 404) throw new MappingRegistrationError("unsupported", "Excubitor has no per-service mapping route");
  if (response.status === 400) throw new MappingRegistrationError("rejected", "Excubitor rejected the mapping");
  throw new MappingRegistrationError("failed", `Excubitor mapping write answered ${response.status}`);
}
