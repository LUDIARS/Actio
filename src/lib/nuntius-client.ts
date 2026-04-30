/**
 * Nuntius クライアント
 *
 * Actio backend が Nuntius (LUDIARS 統合通知基盤) を呼び出す。
 *
 * 認証: Actio 自身の Cernere project credentials を Cernere の
 * /api/auth/login で project_token に交換し、Nuntius API に Bearer で渡す。
 * Nuntius 側は Cernere /api/auth/verify で検証する。
 */

import { secretManager } from "../config/secrets.js";

export type NuntiusChannel =
  | "slack" | "discord" | "line" | "webhook"
  | "email" | "voice" | "alexa" | "sms";

export interface ScheduleParams {
  userId: string;
  channel: NuntiusChannel;
  /** ISO 8601 */
  sendAt: string;
  payload: Record<string, unknown>;
  source?: string;
  templateId?: string;
  priority?: number;
  recurrenceRule?: string;
  idempotencyKey?: string;
}

export interface PublishParams {
  topic: string;
  channel?: NuntiusChannel;
  payload: Record<string, unknown>;
  sendAt?: string;
  source?: string;
}

export interface SubscribeParams {
  topic: string;
  userId: string;
  channel: NuntiusChannel;
  endpoint?: string;
}

class NuntiusClient {
  private cachedToken: { token: string; expiresAt: number } | null = null;

  private getNuntiusUrl(): string {
    const url = secretManager.getOrDefault("NUNTIUS_URL", "");
    if (!url) throw new Error("NUNTIUS_URL not configured");
    return url.replace(/\/$/, "");
  }

  /** Cernere から project_token を取得 (5分キャッシュ) */
  private async getProjectToken(): Promise<string> {
    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.token;
    }
    const cernereUrl = secretManager.getOrDefault("CERNERE_URL", "");
    const clientId = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_ID", "");
    const clientSecret = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_SECRET", "");
    if (!cernereUrl || !clientId || !clientSecret) {
      throw new Error("Cernere project credentials not configured");
    }
    const res = await fetch(`${cernereUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        grant_type: "project_credentials",
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Cernere project login failed: ${res.status} ${body}`);
    }
    const data = (await res.json()) as { accessToken: string; expiresIn?: number };
    const expiresInSec = data.expiresIn ?? 3600;
    this.cachedToken = {
      token: data.accessToken,
      // 余裕をもって 5 分手前で再取得
      expiresAt: Date.now() + (expiresInSec - 300) * 1000,
    };
    return data.accessToken;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.getProjectToken();
    const res = await fetch(`${this.getNuntiusUrl()}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      throw new Error(`Nuntius ${method} ${path} ${res.status}: ${errBody}`);
    }
    return res.json() as Promise<T>;
  }

  // ── Messages (Queue / SQS的) ──────────────────────────

  async schedule(params: ScheduleParams): Promise<{ id: string; sendAt: string; status: string }> {
    return this.request("POST", "/api/messages/schedule", params);
  }

  async cancel(messageId: string): Promise<{ id: string; status: string }> {
    return this.request("DELETE", `/api/messages/${messageId}`);
  }

  async getMessage(messageId: string): Promise<unknown> {
    return this.request("GET", `/api/messages/${messageId}`);
  }

  // ── Topics (Pub/Sub / SNS的) ──────────────────────────

  async publish(params: PublishParams): Promise<{ topic: string; delivered: number }> {
    const { topic, ...rest } = params;
    return this.request("POST", `/api/topics/${encodeURIComponent(topic)}/publish`, rest);
  }

  async subscribe(params: SubscribeParams): Promise<{ id: string; topic: string; enabled: boolean }> {
    const { topic, ...rest } = params;
    return this.request("POST", `/api/topics/${encodeURIComponent(topic)}/subscribe`, rest);
  }

  async unsubscribe(topic: string, userId: string, channel: NuntiusChannel): Promise<unknown> {
    const qs = new URLSearchParams({ userId, channel });
    return this.request("DELETE", `/api/topics/${encodeURIComponent(topic)}/subscribe?${qs}`);
  }

  // ── WebPush ───────────────────────────────────────────

  async getVapidPublicKey(): Promise<{ publicKey: string }> {
    // VAPID 公開鍵は認証不要なので request() を経由しない
    const res = await fetch(`${this.getNuntiusUrl()}/api/push/vapid-public-key`);
    if (!res.ok) {
      throw new Error(`Nuntius vapid-public-key ${res.status}`);
    }
    return res.json() as Promise<{ publicKey: string }>;
  }

  async savePushSubscription(params: {
    userId: string;
    endpoint: string;
    p256dh: string;
    auth: string;
    label?: string | null;
  }): Promise<{ id: string; status: "created" | "updated" }> {
    return this.request("POST", "/api/push/subscriptions", {
      userId: params.userId,
      endpoint: params.endpoint,
      keys: { p256dh: params.p256dh, auth: params.auth },
      label: params.label ?? undefined,
    });
  }

  async listPushSubscriptions(userId: string): Promise<{
    items: Array<{ id: string; label: string | null; userAgent: string | null; createdAt: string; revokedAt: string | null }>;
  }> {
    return this.request("GET", `/api/push/subscriptions?userId=${encodeURIComponent(userId)}`);
  }

  async deletePushSubscription(id: string): Promise<{ ok: boolean }> {
    return this.request("DELETE", `/api/push/subscriptions/${encodeURIComponent(id)}`);
  }

  /** Nuntius が利用可能かを軽く確認 (NUNTIUS_URL + 認証情報があるか) */
  isConfigured(): boolean {
    const url = secretManager.getOrDefault("NUNTIUS_URL", "");
    const cid = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_ID", "");
    const cs = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_SECRET", "");
    return !!url && !!cid && !!cs;
  }
}

export const nuntiusClient = new NuntiusClient();
