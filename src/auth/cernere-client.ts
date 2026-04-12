/**
 * Cernere プロジェクト WS クライアント
 *
 * Cernere にプロジェクト認証 (client_credentials) で WebSocket 接続し、
 * profile.get / profile.update 等のコマンドを実行する。
 *
 * 接続はシングルトンで保持し、切断時は再接続する。
 */

import { WebSocket } from "ws";
import { secretManager } from "../config/secrets.js";

export interface CernereProfile {
  id: string;
  login: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  role: string;
  bio: string;
  roleTitle: string;
  expertise: string[];
  hobbies: string[];
  extra: Record<string, unknown>;
  privacy: Record<string, boolean>;
}

export interface ProfileUpdatePayload {
  displayName?: string;
  avatarUrl?: string | null;
  bio?: string;
  roleTitle?: string;
  expertise?: string[];
  hobbies?: string[];
  extra?: Record<string, unknown>;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const REQUEST_TIMEOUT_MS = 10_000;
const RECONNECT_DELAY_MS = 5_000;

class CernereProjectClient {
  private ws: WebSocket | null = null;
  private connecting: Promise<void> | null = null;
  private pending = new Map<string, PendingRequest>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** project_token を取得 (Cernere の /api/auth/login client_credentials) */
  private async fetchProjectToken(): Promise<string> {
    const cernereUrl = secretManager.getOrDefault("CERNERE_URL", "");
    const clientId = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_ID", "");
    const clientSecret = secretManager.getOrDefault("CERNERE_PROJECT_CLIENT_SECRET", "");
    if (!cernereUrl || !clientId || !clientSecret) {
      throw new Error(
        "Cernere project credentials not configured (CERNERE_URL / CERNERE_PROJECT_CLIENT_ID / CERNERE_PROJECT_CLIENT_SECRET)",
      );
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
    const data = await res.json() as { accessToken: string };
    return data.accessToken;
  }

  /** Cernere への WS 接続を確立 (接続済みなら何もしない) */
  private async ensureConnected(): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      const cernereUrl = secretManager.getOrDefault("CERNERE_URL", "");
      const wsUrl = cernereUrl.replace(/^http/, "ws") + "/ws/project";
      const token = await this.fetchProjectToken();

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
        const connectTimer = setTimeout(() => {
          ws.close();
          reject(new Error("Cernere project WS connect timeout"));
        }, 10_000);

        ws.on("open", () => {
          clearTimeout(connectTimer);
          this.ws = ws;
          console.log("[cernere-client] project WS 接続成功");
          resolve();
        });

        ws.on("message", (raw) => this.handleMessage(raw.toString()));

        ws.on("close", () => {
          console.warn("[cernere-client] project WS 切断");
          this.ws = null;
          // 保留中のリクエストを失敗させる
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error("WS closed"));
          }
          this.pending.clear();
          this.scheduleReconnect();
        });

        ws.on("error", (err) => {
          console.error("[cernere-client] project WS エラー:", err.message);
        });

        ws.on("ping", () => ws.pong());
      });
    })();

    try {
      await this.connecting;
    } finally {
      this.connecting = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureConnected().catch((err) => {
        console.error("[cernere-client] 再接続失敗:", err.message);
        this.scheduleReconnect();
      });
    }, RECONNECT_DELAY_MS);
  }

  private handleMessage(raw: string): void {
    let msg: {
      type: string;
      request_id?: string;
      payload?: unknown;
      code?: string;
      message?: string;
    };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // ping は server から来ないが、念のため
    if (msg.type === "ping") return;

    if (!msg.request_id) {
      if (msg.type === "connected") {
        return; // 接続確認メッセージ
      }
      return;
    }

    const pending = this.pending.get(msg.request_id);
    if (!pending) return;

    clearTimeout(pending.timer);
    this.pending.delete(msg.request_id);

    if (msg.type === "module_response") {
      pending.resolve(msg.payload);
    } else {
      pending.reject(new Error(msg.message ?? `Cernere error: ${msg.code ?? "unknown"}`));
    }
  }

  async request(module: string, action: string, payload: Record<string, unknown>): Promise<unknown> {
    await this.ensureConnected();
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      throw new Error("Cernere WS is not connected");
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Cernere request timeout: ${module}.${action}`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(requestId, { resolve, reject, timer });

      ws.send(JSON.stringify({
        type: "module_request",
        request_id: requestId,
        module,
        action,
        payload,
      }));
    });
  }
}

const cernereClient = new CernereProjectClient();

/** Cernere からユーザープロファイルを取得 */
export async function fetchCernereProfile(userId: string): Promise<CernereProfile> {
  return cernereClient.request("profile", "get", { userId }) as Promise<CernereProfile>;
}

/** Cernere のユーザープロファイルを更新 */
export async function updateCernereProfile(
  userId: string,
  payload: ProfileUpdatePayload,
): Promise<CernereProfile> {
  return cernereClient.request("profile", "update", {
    userId,
    ...payload,
  }) as Promise<CernereProfile>;
}
