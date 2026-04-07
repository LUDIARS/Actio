/**
 * WS ブロードキャストヘルパー
 *
 * リアルタイム通知を特定のユーザー群に送信するユーティリティ。
 * Phase 3: グループメンバーへの relay broadcast、予約通知、PM 同期通知など。
 */

import { broadcastToUser } from "./session.js";
import { groupMemberRepo } from "../db/repository.js";

// ── 通知メッセージ型 ────────────────────────────────

export interface WsNotification {
  type: "notification";
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

function createNotification(
  event: string,
  payload: Record<string, unknown>,
): WsNotification {
  return {
    type: "notification",
    event,
    payload,
    timestamp: new Date().toISOString(),
  };
}

// ── ブロードキャスト関数 ──────────────────────────────

/**
 * 指定グループの全メンバーに通知を送信する。
 * excludeUserId を指定すると、そのユーザーには送信しない（操作者自身を除外）。
 */
export async function broadcastToGroupMembers(
  groupId: string,
  event: string,
  payload: Record<string, unknown>,
  excludeUserId?: string,
): Promise<void> {
  const members = await groupMemberRepo.findByGroupId(groupId);
  const notification = createNotification(event, payload);

  for (const member of members) {
    if (member.userId !== excludeUserId) {
      broadcastToUser(member.userId, notification);
    }
  }
}

/**
 * 指定ユーザーリストに通知を送信する。
 */
export function broadcastToUsers(
  userIds: string[],
  event: string,
  payload: Record<string, unknown>,
  excludeUserId?: string,
): void {
  const notification = createNotification(event, payload);

  for (const uid of userIds) {
    if (uid !== excludeUserId) {
      broadcastToUser(uid, notification);
    }
  }
}

/**
 * 単一ユーザーに通知を送信する。
 */
export function notifyUser(
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): void {
  broadcastToUser(userId, createNotification(event, payload));
}
