/**
 * Nuntius `/api/notify/user` 共通ラッパ
 *
 * event-reminders.ts (予約通知) / task-notifications.ts (即時通知) から
 * 共有して使う。 NUNTIUS_URL 未設定 / project_token 取得失敗時は no-op。
 */

import { secretManager } from "../config/secrets.js";

export interface NuntiusNotifyBody {
  userId: string;
  title: string;
  body: string;
  url?: string;
  sendAt?: string;
  source?: string;
  idempotencyKey?: string;
}

export function nuntiusUrl(): string | null {
  const url = secretManager.getOrDefault("NUNTIUS_URL", "");
  return url ? url.replace(/\/$/, "") : null;
}

const tokenCache: { value: string; expiresAt: number } = { value: "", expiresAt: 0 };

export async function getProjectToken(): Promise<string | null> {
  if (tokenCache.value && tokenCache.expiresAt > Date.now()) return tokenCache.value;
  const cernereUrl = secretManager.getOrDefault("CERNERE_URL", "");
  const clientId = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_ID", "");
  const clientSecret = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_SECRET", "");
  if (!cernereUrl || !clientId || !clientSecret) return null;
  const res = await fetch(`${cernereUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "project_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken: string; expiresIn?: number };
  tokenCache.value = data.accessToken;
  tokenCache.expiresAt = Date.now() + ((data.expiresIn ?? 3600) - 300) * 1000;
  return data.accessToken;
}

/** Nuntius `/api/notify/user` を叩く。 409 (idempotency 衝突) は黙認。 */
export async function postNotify(body: NuntiusNotifyBody): Promise<void> {
  const url = nuntiusUrl();
  if (!url) return;
  const token = await getProjectToken();
  if (!token) return;
  const res = await fetch(`${url}/api/notify/user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 409) {
    const text = await res.text().catch(() => "");
    throw new Error(`Nuntius /api/notify/user ${res.status}: ${text}`);
  }
}

/** Nuntius `DELETE /api/messages/by-source` を sourcePrefix で叩く。 */
export async function cancelBySourcePrefix(sourcePrefix: string): Promise<{ count: number } | null> {
  const url = nuntiusUrl();
  if (!url) return null;
  const token = await getProjectToken();
  if (!token) return null;
  const res = await fetch(`${url}/api/messages/by-source`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ sourcePrefix }),
  });
  if (!res.ok) {
    if (res.status !== 404) {
      const text = await res.text().catch(() => "");
      console.warn(`[nuntius-notify] cancel-by-source ${res.status}: ${text}`);
    }
    return null;
  }
  return (await res.json().catch(() => null)) as { count: number } | null;
}
