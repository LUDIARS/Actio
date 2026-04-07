/**
 * Cernere サービスブリッジ
 *
 * CernereServiceAdapter を使って Cernere の /ws/service に常時接続し、
 * セッションライフサイクル (admission / revoke) を一本化する。
 */

import { CernereServiceAdapter } from "@ludiars/cernere-service-adapter";
import type { AdmittedUser } from "@ludiars/cernere-service-adapter";
import { secretManager } from "../config/secrets.js";
import { revokeUserSessions } from "./session.js";

let adapter: CernereServiceAdapter | null = null;

/**
 * CernereServiceAdapter インスタンスを取得する。
 * 未初期化の場合は null を返す。
 */
export function getCernereAdapter(): CernereServiceAdapter | null {
  return adapter;
}

/**
 * Cernere サービス WS 接続を初期化する。
 *
 * 必要な環境変数:
 *   - CERNERE_WS_URL: Cernere WebSocket URL (例: "ws://localhost:8080/ws/service")
 *   - CERNERE_SERVICE_SECRET: サービスシークレット
 *   - SERVICE_JWT_SECRET: service_token 発行用 JWT シークレット
 *
 * いずれかが未設定の場合はスキップする（開発環境向け）。
 */
export function initCernereBridge(callbacks?: {
  onUserAdmission?: (user: AdmittedUser) => Promise<void>;
}): void {
  const cernereWsUrl = secretManager.get("CERNERE_WS_URL");
  const serviceSecret = secretManager.get("CERNERE_SERVICE_SECRET");
  const jwtSecret = secretManager.get("SERVICE_JWT_SECRET");

  if (!cernereWsUrl || !serviceSecret || !jwtSecret) {
    console.warn(
      "[cernere-bridge] Cernere サービス接続情報が未設定のためスキップ " +
      "(CERNERE_WS_URL, CERNERE_SERVICE_SECRET, SERVICE_JWT_SECRET)"
    );
    return;
  }

  adapter = new CernereServiceAdapter(
    {
      cernereWsUrl,
      serviceCode: "schedula",
      serviceSecret,
      jwtSecret,
    },
    {
      onUserAdmission: async (user, organizationId, _scopes) => {
        console.log(
          `[cernere-bridge] User admitted: ${user.id} (${user.displayName})` +
          (organizationId ? ` org=${organizationId}` : "")
        );
        await callbacks?.onUserAdmission?.(user);
      },

      onUserRevoke: async (userId) => {
        console.log(`[cernere-bridge] User revoked: ${userId}`);
        revokeUserSessions(userId);
      },

      onConnected: (serviceId) => {
        console.log(`[cernere-bridge] Cernere に接続 (service_id: ${serviceId})`);
      },

      onDisconnected: () => {
        console.warn("[cernere-bridge] Cernere から切断、自動再接続中...");
      },

      onError: (code, message) => {
        console.error(`[cernere-bridge] エラー: ${code} — ${message}`);
      },
    },
  );

  adapter.connect();
  console.log(`[cernere-bridge] Cernere への接続を開始: ${cernereWsUrl}`);
}
