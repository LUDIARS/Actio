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
      console.log(`[cernere-client] project token 取得中...`);
      const token = await this.fetchProjectToken();
      console.log(`[cernere-client] project token 取得完了 (len=${token.length})`);
      console.log(`[cernere-client] WS 接続先: ${wsUrl}`);

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);
        let opened = false;
        const connectTimer = setTimeout(() => {
          ws.close();
          reject(new Error("Cernere project WS connect timeout"));
        }, 10_000);

        ws.on("open", () => {
          clearTimeout(connectTimer);
          opened = true;
          this.ws = ws;
          console.log("[cernere-client] project WS 接続成功");
          resolve();
        });

        ws.on("unexpected-response", (_req, res) => {
          console.error(
            `[cernere-client] project WS HTTP エラー: ${res.statusCode} ${res.statusMessage}`,
          );
          let body = "";
          res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          res.on("end", () => {
            if (body) console.error(`[cernere-client] レスポンス: ${body}`);
          });
        });

        ws.on("message", (raw) => this.handleMessage(raw.toString()));

        ws.on("close", (code, reason) => {
          console.warn(
            `[cernere-client] project WS 切断 (code=${code}, reason="${reason?.toString() ?? ""}", opened=${opened})`,
          );
          this.ws = null;
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error("WS closed"));
          }
          this.pending.clear();
          // 接続前のcloseなら reject, 以降は再接続のみ
          if (!opened) {
            clearTimeout(connectTimer);
            reject(new Error(`WS closed before open: code=${code}`));
          } else {
            this.scheduleReconnect();
          }
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

// ── Composite auth (埋め込みログイン用) ──────────────────

export interface CompositeAuthResponse {
  authCode?: string;
  mfaRequired?: boolean;
  mfaMethods?: string[];
  mfaToken?: string;
}

/** Cernere Composite login を project WS 経由で実行 */
export async function compositeLogin(email: string, password: string): Promise<CompositeAuthResponse> {
  return cernereClient.request("auth", "login", { email, password }) as Promise<CompositeAuthResponse>;
}

/** Cernere Composite register を project WS 経由で実行 */
export async function compositeRegister(name: string, email: string, password: string): Promise<CompositeAuthResponse> {
  return cernereClient.request("auth", "register", { name, email, password }) as Promise<CompositeAuthResponse>;
}

/** Cernere Composite MFA 検証を project WS 経由で実行 */
export async function compositeMfaVerify(mfaToken: string, method: string, code: string): Promise<CompositeAuthResponse> {
  return cernereClient.request("auth", "mfa-verify", { mfaToken, method, code }) as Promise<CompositeAuthResponse>;
}

// ── managed_project ユーザーデータ API (Module SDK の ctx.userData で使用) ──

/**
 * Cernere project_data_{projectKey} から指定カラムを取得。
 * columns 未指定なら全カラム。未接続時は空オブジェクトを返す (フォールバック)。
 */
export async function getProjectUserColumns(
  userId: string,
  columns?: string[],
): Promise<Record<string, unknown>> {
  try {
    return await cernereClient.request("managed_project", "get_user_data", {
      userId,
      ...(columns ? { columns } : {}),
    }) as Record<string, unknown>;
  } catch (err) {
    console.warn("[cernere-client] get_user_data failed, returning empty:", err);
    return {};
  }
}

/** Cernere project_data_{projectKey} に部分 upsert */
export async function setProjectUserData(
  userId: string,
  data: Record<string, unknown>,
): Promise<{ ok: true; updated: string[] }> {
  return cernereClient.request("managed_project", "set_user_data", {
    userId,
    data,
  }) as Promise<{ ok: true; updated: string[] }>;
}

/** Cernere project_data_{projectKey} の指定カラムを NULL 化 */
export async function deleteProjectUserColumns(
  userId: string,
  columns: string[],
): Promise<{ ok: true; deleted: string[] }> {
  return cernereClient.request("managed_project", "delete_user_data", {
    userId,
    columns,
  }) as Promise<{ ok: true; deleted: string[] }>;
}

/** Cernere project schema を更新 (manifest の userData カラム反映に使用) */
export async function updateProjectSchema(
  definition: Record<string, unknown>,
): Promise<{ message: string; key: string; columnsAdded: string[] }> {
  return cernereClient.request("managed_project", "update_schema", definition) as Promise<{
    message: string;
    key: string;
    columnsAdded: string[];
  }>;
}

// ── OAuth Token Storage (個人データ保管禁止ルールの基盤) ────────

export interface CernereOAuthToken {
  provider: string;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
  tokenType: string | null;
  scope: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface StoreOAuthTokenInput {
  provider: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  metadata?: Record<string, unknown>;
}

/** Cernere に OAuth token を保管 (upsert) */
export async function storeOAuthToken(
  userId: string,
  input: StoreOAuthTokenInput,
): Promise<{ ok: true; provider: string }> {
  return cernereClient.request("managed_project", "store_oauth_token", {
    userId,
    ...input,
  }) as Promise<{ ok: true; provider: string }>;
}

/** Cernere から OAuth token を取得。未登録なら null */
export async function getOAuthToken(
  userId: string,
  provider: string,
): Promise<CernereOAuthToken | null> {
  try {
    return await cernereClient.request("managed_project", "get_oauth_token", {
      userId,
      provider,
    }) as CernereOAuthToken | null;
  } catch (err) {
    console.warn("[cernere-client] get_oauth_token failed:", err);
    return null;
  }
}

/** Cernere から全 OAuth token を列挙 */
export async function listOAuthTokens(userId: string): Promise<CernereOAuthToken[]> {
  try {
    return await cernereClient.request("managed_project", "list_oauth_tokens", {
      userId,
    }) as CernereOAuthToken[];
  } catch (err) {
    console.warn("[cernere-client] list_oauth_tokens failed:", err);
    return [];
  }
}

/** Cernere から OAuth token を削除 */
export async function deleteOAuthToken(
  userId: string,
  provider: string,
): Promise<{ ok: true; deleted: boolean }> {
  return cernereClient.request("managed_project", "delete_oauth_token", {
    userId,
    provider,
  }) as Promise<{ ok: true; deleted: boolean }>;
}
