/**
 * WS ハンドラ
 *
 * @hono/node-ws を使って WebSocket エンドポイント (/ws) を提供する。
 * JWT 検証は id-cache の 3 点認証を流用し、独自検証は行わない。
 */

import { createNodeWebSocket } from "@hono/node-ws";
import type { Hono } from "hono";
import { secretManager } from "../config/secrets.js";
import { registerSession, removeSession, updatePong } from "./session.js";
import { dispatch } from "./dispatcher.js";
import { getCernereAdapter } from "./cernere-bridge.js";

// ── JWT 検証 (Schedula 自身が発行した service_token をローカル検証) ──
// Cernere とは JWT_SECRET を共有しないため、id-cache は使わない。

const jwtSecret = secretManager.get("JWT_SECRET");

// ── メッセージ型 ────────────────────────────────────

interface ClientMessage {
  type: string;
  module?: string;
  action?: string;
  payload?: unknown;
  ts?: number;
}

// ── WS セットアップ ─────────────────────────────────

export function setupWebSocket(app: Hono) {
  const { upgradeWebSocket, injectWebSocket } = createNodeWebSocket({ app });

  app.get(
    "/ws",
    upgradeWebSocket((c) => {
      const token = c.req.query("token");

      // 認証は onOpen 前に解決する必要があるため、クロージャで userId を保持
      let userId: string | null = null;
      let userName: string | null = null;
      let userRole: string | null = null;
      let sessionId: string | null = null;

      return {
        async onOpen(_evt, ws) {
          // ── id-cache 3 点認証 ──────────────────
          if (!token) {
            ws.send(JSON.stringify({
              type: "error",
              code: "auth_required",
              message: "Missing token",
            }));
            ws.close(1008, "Missing token");
            return;
          }

          let user: { id: string; name: string; email: string; role: string } | null = null;
          if (jwtSecret) {
            try {
              const jwt = await import("jsonwebtoken");
              const payload = jwt.default.verify(token, jwtSecret) as {
                sub?: string;
                userId?: string;
                name?: string;
                email?: string;
                role?: string;
              };
              user = {
                id: payload.sub ?? payload.userId ?? "unknown",
                name: payload.name ?? "unknown",
                email: payload.email ?? "",
                role: payload.role ?? "general",
              };
            } catch {
              user = null;
            }
          }

          if (!user) {
            ws.send(JSON.stringify({
              type: "error",
              code: "auth_failed",
              message: "Authentication failed",
            }));
            ws.close(1008, "Authentication failed");
            return;
          }

          // revoke チェック
          const adapter = getCernereAdapter();
          if (adapter?.isRevoked(user.id)) {
            ws.send(JSON.stringify({
              type: "error",
              code: "session_revoked",
              message: "User session revoked",
            }));
            ws.close(1008, "Session revoked");
            return;
          }

          userId = user.id;
          userName = user.name;
          userRole = user.role;

          // セッション登録 (ping タイマー開始)
          const wsSendable = {
            send: (data: string) => ws.send(data),
            close: () => ws.close(),
          };
          sessionId = registerSession(userId, wsSendable);

          // connected メッセージ送信
          ws.send(JSON.stringify({
            type: "connected",
            session_id: sessionId,
            user: { id: userId, name: userName, role: userRole },
          }));

          console.log(`[ws] Session connected: ${sessionId} (user: ${userId})`);
        },

        async onMessage(evt, ws) {
          if (!userId || !sessionId) return;

          let msg: ClientMessage;
          try {
            const data = typeof evt.data === "string"
              ? evt.data
              : evt.data.toString();
            msg = JSON.parse(data);
          } catch {
            ws.send(JSON.stringify({
              type: "error",
              code: "parse_error",
              message: "Invalid JSON",
            }));
            return;
          }

          switch (msg.type) {
            case "pong":
              updatePong(sessionId);
              break;

            case "module_request": {
              if (!msg.module || !msg.action) {
                ws.send(JSON.stringify({
                  type: "error",
                  code: "invalid_request",
                  message: "module and action are required",
                }));
                return;
              }

              try {
                const result = await dispatch(msg.module, msg.action, userId, msg.payload);
                ws.send(JSON.stringify({
                  type: "module_response",
                  module: msg.module,
                  action: msg.action,
                  payload: result,
                }));
              } catch (err) {
                ws.send(JSON.stringify({
                  type: "error",
                  code: "command_error",
                  message: err instanceof Error ? err.message : "Unknown error",
                }));
              }
              break;
            }

            default:
              ws.send(JSON.stringify({
                type: "error",
                code: "unknown_message_type",
                message: `Unknown type: ${msg.type}`,
              }));
          }
        },

        onClose() {
          if (sessionId) {
            removeSession(sessionId);
            console.log(`[ws] Session disconnected: ${sessionId} (user: ${userId})`);
          }
        },

        onError(err) {
          console.error(`[ws] Session error (${sessionId}):`, err);
        },
      };
    }),
  );

  return { injectWebSocket };
}
