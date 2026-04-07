/**
 * WS コマンドヘルパー
 *
 * 各モジュールの破壊的操作を WS module_request としてラップする。
 * Phase 2 で段階的にモジュール別ヘルパーを追加していく。
 *
 * 読み取り操作は引き続き REST API (api.ts) を使用する。
 */

import { wsClient } from "./ws-client";

/**
 * 汎用 WS コマンド送信。
 *
 * ```typescript
 * const result = await wsCommand<MyResponse>("calendar", "create_event", { title: "..." });
 * ```
 */
export async function wsCommand<T = unknown>(
  module: string,
  action: string,
  payload?: unknown,
): Promise<T> {
  return wsClient.sendCommand<T>(module, action, payload);
}

// ── Phase 2 で追加予定のモジュール別ヘルパー ─────────
// 以下はスケルトン。各モジュールの WS 移行時に型付きヘルパーを実装する。

// export const wsCalendar = {
//   createEvent: (data: CreateEventInput) => wsCommand("calendar", "create_event", data),
//   deleteEvent: (id: string) => wsCommand("calendar", "delete_event", { id }),
// };

// export const wsGroup = {
//   create: (data: CreateGroupInput) => wsCommand("group", "create", data),
//   delete: (id: string) => wsCommand("group", "delete", { id }),
// };
