/**
 * Schedula WebSocket クライアント
 *
 * Cernere の WS プロトコルに準拠し、Schedula バックエンドとの
 * 常時接続セッションを管理する。
 *
 * 破壊的操作は module_request 経由で送信し、
 * 読み取り操作は従来の REST API を継続使用する。
 */

type ServerMessage = {
  type: string;
  session_id?: string;
  module?: string;
  action?: string;
  payload?: unknown;
  code?: string;
  message?: string;
  ts?: number;
  user?: { id: string; name: string; role: string };
};

type PendingRequest = {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  module: string;
  action: string;
  timer: ReturnType<typeof setTimeout>;
};

const REQUEST_TIMEOUT_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

class SchedulaWsClient {
  private ws: WebSocket | null = null;
  private pendingRequests: PendingRequest[] = [];
  private listeners: Array<(msg: ServerMessage) => void> = [];
  private _connected = false;
  private _sessionId: string | null = null;
  private connectPromise: Promise<void> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private currentToken: string | null = null;
  private intentionalClose = false;

  get connected(): boolean {
    return this._connected;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  /**
   * Schedula バックエンドに WS 接続する。
   */
  connect(token: string): Promise<void> {
    this.currentToken = token;
    this.intentionalClose = false;

    if (this._connected) {
      return Promise.resolve();
    }
    if (this.connectPromise) {
      return this.connectPromise;
    }

    this.connectPromise = new Promise((resolve, reject) => {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const url = `${protocol}//${window.location.host}/ws?token=${encodeURIComponent(token)}`;

      this.ws = new WebSocket(url);

      const timeout = setTimeout(() => {
        this.connectPromise = null;
        reject(new Error("WebSocket connection timeout"));
      }, 10_000);

      this.ws.onopen = () => {
        // connected メッセージを待つ
      };

      this.ws.onmessage = (evt) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }
        this.handleMessage(msg, () => {
          clearTimeout(timeout);
          this.connectPromise = null;
          this.reconnectAttempt = 0;
          resolve();
        });
      };

      this.ws.onerror = () => {
        clearTimeout(timeout);
        this.connectPromise = null;
        reject(new Error("WebSocket connection failed"));
      };

      this.ws.onclose = () => {
        this._connected = false;
        this._sessionId = null;
        this.connectPromise = null;

        if (!this.intentionalClose && this.currentToken) {
          this.scheduleReconnect();
        }
      };
    });

    return this.connectPromise;
  }

  /**
   * 切断する (再接続なし)。
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.currentToken = null;
    this.reconnectAttempt = 0;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // 未解決リクエストを reject
    for (const req of this.pendingRequests) {
      clearTimeout(req.timer);
      req.reject(new Error("WebSocket disconnected"));
    }
    this.pendingRequests = [];

    this.ws?.close();
    this.ws = null;
    this._connected = false;
    this._sessionId = null;
    this.connectPromise = null;
  }

  /**
   * サーバーメッセージリスナーを登録する。
   * 戻り値の関数を呼ぶと解除される。
   */
  onMessage(listener: (msg: ServerMessage) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  /**
   * module_request を送信し、対応する module_response を待つ。
   */
  async sendCommand<T = unknown>(
    module: string,
    action: string,
    payload?: unknown,
  ): Promise<T> {
    // 接続待ち
    if (!this._connected && this.connectPromise) {
      await this.connectPromise;
    }

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this.pendingRequests.findIndex(
          (r) => r.module === module && r.action === action && r.timer === timer,
        );
        if (idx >= 0) {
          this.pendingRequests.splice(idx, 1);
        }
        reject(new Error(`Request timeout: ${module}.${action}`));
      }, REQUEST_TIMEOUT_MS);

      this.pendingRequests.push({
        resolve: resolve as (p: unknown) => void,
        reject,
        module,
        action,
        timer,
      });

      this.ws!.send(JSON.stringify({
        type: "module_request",
        module,
        action,
        payload,
      }));
    });
  }

  // ── 内部 ──────────────────────────────────────

  private handleMessage(msg: ServerMessage, onConnect?: () => void): void {
    switch (msg.type) {
      case "connected":
        this._connected = true;
        this._sessionId = msg.session_id ?? null;
        onConnect?.();
        break;

      case "module_response": {
        const idx = this.pendingRequests.findIndex(
          (r) => r.module === msg.module && r.action === msg.action,
        );
        if (idx >= 0) {
          const req = this.pendingRequests.splice(idx, 1)[0];
          clearTimeout(req.timer);
          req.resolve(msg.payload);
        }
        break;
      }

      case "error": {
        // session_revoked は全 pending を reject
        if (msg.code === "session_revoked") {
          for (const req of this.pendingRequests) {
            clearTimeout(req.timer);
            req.reject(new Error(msg.message ?? "Session revoked"));
          }
          this.pendingRequests = [];
          break;
        }

        // その他のエラーは先頭の pending を reject
        const pending = this.pendingRequests.shift();
        if (pending) {
          clearTimeout(pending.timer);
          pending.reject(new Error(msg.message ?? "Unknown error"));
        }
        break;
      }

      case "ping":
        this.ws?.send(JSON.stringify({ type: "pong", ts: msg.ts }));
        break;
    }

    for (const listener of this.listeners) {
      listener(msg);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.intentionalClose) return;

    const delay = Math.min(
      RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempt),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempt++;

    console.log(`[ws] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})...`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (this.currentToken && !this.intentionalClose) {
        this.connect(this.currentToken).catch(() => {
          // onclose で再度 scheduleReconnect が呼ばれる
        });
      }
    }, delay);
  }
}

export const wsClient = new SchedulaWsClient();
