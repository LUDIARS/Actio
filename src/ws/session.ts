/**
 * WS セッション管理
 *
 * インメモリで WS 接続を管理し、Cernere の user_revoke と連動して
 * セッションの強制切断を行う。
 *
 * Schedula 独自の Redis セッションストアは持たない。
 * 権威セッションは Cernere が管理し、ここではアクティブな WS 接続のみ追跡する。
 */

import { randomUUID } from "node:crypto";

// ── 型定義 ──────────────────────────────────────────

interface WsSendable {
  send(data: string): void;
  close(): void;
}

interface WsSession {
  userId: string;
  sessionId: string;
  ws: WsSendable;
  lastPong: number;
  pingTimer: ReturnType<typeof setInterval> | null;
}

// ── セッションレジストリ ────────────────────────────

const sessions = new Map<string, WsSession>();

const PING_INTERVAL_MS = 30_000;
const PONG_TIMEOUT_MS = 40_000; // ping 間隔 + 10s マージン

/**
 * 新しい WS セッションを登録し、Ping タイマーを開始する。
 */
export function registerSession(
  userId: string,
  ws: WsSendable,
): string {
  const sessionId = randomUUID();

  const pingTimer = setInterval(() => {
    const s = sessions.get(sessionId);
    if (!s) return;

    if (Date.now() - s.lastPong > PONG_TIMEOUT_MS) {
      s.ws.close();
      removeSession(sessionId);
      return;
    }

    s.ws.send(JSON.stringify({ type: "ping", ts: Date.now() }));
  }, PING_INTERVAL_MS);

  sessions.set(sessionId, {
    userId,
    sessionId,
    ws,
    lastPong: Date.now(),
    pingTimer,
  });

  return sessionId;
}

/**
 * セッションを削除し、Ping タイマーを停止する。
 */
export function removeSession(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (!s) return;
  if (s.pingTimer) clearInterval(s.pingTimer);
  sessions.delete(sessionId);
}

/**
 * Pong 受信時に lastPong を更新する。
 */
export function updatePong(sessionId: string): void {
  const s = sessions.get(sessionId);
  if (s) s.lastPong = Date.now();
}

/**
 * 指定ユーザーの全セッションを取得する。
 */
export function getSessionsByUser(userId: string): WsSession[] {
  return [...sessions.values()].filter((s) => s.userId === userId);
}

/**
 * 指定ユーザーの全 WS セッションにメッセージを送信する。
 */
export function broadcastToUser(userId: string, message: unknown): void {
  const json = JSON.stringify(message);
  for (const s of getSessionsByUser(userId)) {
    s.ws.send(json);
  }
}

/**
 * Cernere からの user_revoke に対応。
 * 該当ユーザーの全 WS セッションを強制切断する。
 */
export function revokeUserSessions(userId: string): void {
  for (const s of getSessionsByUser(userId)) {
    s.ws.send(JSON.stringify({
      type: "error",
      code: "session_revoked",
      message: "Session revoked by Cernere",
    }));
    s.ws.close();
    removeSession(s.sessionId);
  }
}

/**
 * セッション数を返す（ヘルスチェック用）。
 */
export function getSessionCount(): number {
  return sessions.size;
}
