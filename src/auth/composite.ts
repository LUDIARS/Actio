/**
 * Cernere Composite — バックエンド認証コンポジット初期化
 *
 * 起動時に Cernere に WebSocket 接続 (プロジェクト認証) し、
 * ユーザー認証を仲介するエンドポイントを提供する。
 */

import { CernereComposite } from "@ludiars/cernere-composite";
import { secretManager } from "../config/secrets.js";

let composite: CernereComposite | null = null;

/** Composite を初期化して Cernere に接続する (起動時に1回呼ぶ) */
export function initComposite(): CernereComposite | null {
  const cernereUrl = secretManager.get("CERNERE_URL");
  const serviceCode = secretManager.get("CERNERE_SERVICE_CODE");
  const serviceSecret = secretManager.get("CERNERE_SERVICE_SECRET");
  const jwtSecret = secretManager.get("JWT_SECRET");

  if (!cernereUrl || !serviceCode || !serviceSecret || !jwtSecret) {
    console.warn("[composite] Cernere Composite 設定が不完全です。スキップします。");
    console.warn("[composite]   CERNERE_URL:", cernereUrl ? "設定済み" : "未設定");
    console.warn("[composite]   CERNERE_SERVICE_CODE:", serviceCode ? "設定済み" : "未設定");
    console.warn("[composite]   CERNERE_SERVICE_SECRET:", serviceSecret ? "設定済み" : "未設定");
    return null;
  }

  // HTTP URL → WS URL 変換
  const wsUrl = cernereUrl.replace(/^http/, "ws") + "/ws/service";

  composite = new CernereComposite(
    {
      cernereUrl,
      cernereWsUrl: wsUrl,
      serviceCode,
      serviceSecret,
      jwtSecret,
    },
    {
      onConnected: (serviceId) => {
        console.log(`[composite] Cernere に接続完了 (serviceId: ${serviceId})`);
      },
      onDisconnected: () => {
        console.warn("[composite] Cernere との接続が切れました。再接続を試みます...");
      },
      onError: (code, message) => {
        console.error(`[composite] Cernere エラー: ${code} — ${message}`);
      },
    },
  );

  composite.connect();
  return composite;
}

/** 現在の Composite インスタンスを取得 */
export function getComposite(): CernereComposite | null {
  return composite;
}
