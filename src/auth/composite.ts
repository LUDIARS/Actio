/**
 * Cernere Composite — バックエンド認証コンポジット初期化
 *
 * 起動時に Cernere に WebSocket 接続 (プロジェクト認証) し、
 * ユーザー認証を仲介するエンドポイントを提供する。
 *
 * CernereServiceAdapter で WS プロジェクト認証を行い、
 * auth_code exchange は HTTP で Cernere に問い合わせる。
 */

import { CernereServiceAdapter } from "@ludiars/cernere-service-adapter";
import { secretManager } from "../config/secrets.js";

interface CernereUser {
  id: string;
  displayName: string;
  email: string;
  role: string;
}

interface ExchangeResult {
  serviceToken: string;
  user: CernereUser;
}

let adapter: CernereServiceAdapter | null = null;
let cernereUrl = "";
let serviceCode = "";
let jwtSecret = "";
let tokenExpiresIn = 900;

/** Composite を初期化して Cernere に接続する (起動時に1回呼ぶ) */
export function initComposite(): void {
  cernereUrl = secretManager.getOrDefault("CERNERE_URL", "");
  serviceCode = secretManager.getOrDefault("CERNERE_SERVICE_CODE", "");
  const serviceSecret = secretManager.getOrDefault("CERNERE_SERVICE_SECRET", "");
  jwtSecret = secretManager.getOrDefault("JWT_SECRET", "");

  if (!cernereUrl || !serviceCode || !serviceSecret || !jwtSecret) {
    console.warn("[composite] Cernere Composite 設定が不完全です。スキップします。");
    console.warn("[composite]   CERNERE_URL:", cernereUrl ? "設定済み" : "未設定");
    console.warn("[composite]   CERNERE_SERVICE_CODE:", serviceCode ? "設定済み" : "未設定");
    console.warn("[composite]   CERNERE_SERVICE_SECRET:", serviceSecret ? "設定済み" : "未設定");
    return;
  }

  const wsUrl = cernereUrl.replace(/^http/, "ws") + "/ws/service";

  adapter = new CernereServiceAdapter(
    {
      cernereWsUrl: wsUrl,
      serviceCode,
      serviceSecret,
      jwtSecret,
      tokenExpiresIn,
    },
    {
      onConnected: (sid: string) => {
        console.log(`[composite] Cernere に接続完了 (serviceId: ${sid})`);
      },
      onDisconnected: () => {
        console.warn("[composite] Cernere との接続が切れました。再接続を試みます...");
      },
      onError: (c: string, m: string) => {
        console.error(`[composite] Cernere エラー: ${c} — ${m}`);
      },
    },
  );

  adapter.connect();
}

/** Cernere Composite ログイン URL を返す */
export function getLoginUrl(origin: string): string | null {
  if (!cernereUrl) return null;
  return `${cernereUrl}/composite/login?origin=${encodeURIComponent(origin)}`;
}

/** auth_code を Cernere で交換し、service_token を発行する */
export async function exchangeAuthCode(authCode: string): Promise<ExchangeResult> {
  if (!cernereUrl) throw new Error("Cernere Composite is not configured");

  const res = await fetch(`${cernereUrl}/api/auth/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: authCode }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Cernere exchange failed: ${res.status} ${body}`);
  }

  const data = await res.json() as {
    accessToken: string;
    refreshToken: string;
    user: CernereUser;
  };

  const serviceToken = await issueServiceToken(data.user);
  return { serviceToken, user: data.user };
}

/** Composite が有効か */
export function isCompositeEnabled(): boolean {
  return !!cernereUrl && !!adapter;
}

// ── service_token 発行 ──────────────────────────────────────

async function issueServiceToken(user: CernereUser): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    name: user.displayName,
    email: user.email,
    role: user.role,
    iat: now,
    exp: now + tokenExpiresIn,
    iss: serviceCode,
  };

  const enc = (obj: unknown) =>
    Buffer.from(JSON.stringify(obj)).toString("base64url");
  const headerB64 = enc(header);
  const payloadB64 = enc(payload);
  const data = `${headerB64}.${payloadB64}`;

  const crypto = await import("node:crypto");
  const signature = crypto
    .createHmac("sha256", jwtSecret)
    .update(data)
    .digest("base64url");

  return `${data}.${signature}`;
}
