/**
 * Cernere Composite — ユーザー認証フロー
 *
 * Cernere のポップアップ/リダイレクトログインで得た auth_code を
 * Cernere の /api/auth/exchange で accessToken / user 情報に交換し、
 * Actio 自身の service_token を発行する。
 */

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

let cernereUrl = "";
let jwtSecret = "";
const TOKEN_EXPIRES_IN_SECONDS = 900;

/** Composite を初期化する (起動時に1回呼ぶ) */
export function initComposite(): void {
  cernereUrl = secretManager.getOrDefault("CERNERE_URL", "");
  jwtSecret = secretManager.getOrDefault("JWT_SECRET", "");

  if (!cernereUrl || !jwtSecret) {
    console.warn("[composite] Cernere Composite 設定が不完全です。スキップします。");
    console.warn("[composite]   CERNERE_URL:", cernereUrl ? "設定済み" : "未設定");
    console.warn("[composite]   JWT_SECRET:", jwtSecret ? "設定済み" : "未設定");
    return;
  }

  console.log("[composite] Cernere Composite 初期化完了");
}

/** Cernere Composite ログイン URL を返す */
export function getLoginUrl(origin: string): string | null {
  if (!cernereUrl) return null;
  return `${cernereUrl}/composite/login?origin=${encodeURIComponent(origin)}`;
}

/** auth_code を Cernere で交換し、service_token を発行する */
export async function exchangeAuthCode(authCode: string): Promise<ExchangeResult> {
  if (!cernereUrl) throw new Error("Cernere Composite is not configured");

  const codeMask = `${authCode.slice(0, 8)}…(${authCode.length})`;
  const url = `${cernereUrl}/api/auth/exchange`;
  console.log(`[trace:cernere-exchange] step=request url=${url} code=${codeMask}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: authCode }),
  });
  console.log(`[trace:cernere-exchange] step=response status=${res.status} ok=${res.ok}`);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.log(`[trace:cernere-exchange] step=error status=${res.status} body=${body.slice(0, 200)}`);
    throw new Error(`Cernere exchange failed: ${res.status} ${body}`);
  }

  const data = await res.json() as {
    accessToken: string;
    refreshToken: string;
    user: CernereUser;
  };
  console.log(`[trace:cernere-exchange] step=parsed userId=${data.user?.id ?? "(none)"} hasAccessToken=${!!data.accessToken} hasRefreshToken=${!!data.refreshToken}`);

  const serviceToken = await issueServiceToken(data.user);
  return { serviceToken, user: data.user };
}

/** Composite が有効か */
export function isCompositeEnabled(): boolean {
  return !!cernereUrl && !!jwtSecret;
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
    exp: now + TOKEN_EXPIRES_IN_SECONDS,
    iss: "actio",
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
