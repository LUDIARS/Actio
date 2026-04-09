/**
 * useWsEvent — WS リアルタイム通知フック
 *
 * サーバーからの notification メッセージを購読し、
 * 指定イベント名にマッチした際にコールバックを実行する。
 */

import { useEffect, useRef } from "react";
import { wsClient } from "../lib/ws-client";

interface WsNotification {
  type: "notification";
  event: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

/**
 * 特定の WS イベントを購読する。
 *
 * @param event - イベント名 (e.g. "group.event_created") または null で全イベント
 * @param callback - 通知受信時のコールバック
 *
 * @example
 * ```tsx
 * useWsEvent("group.event_created", (payload) => {
 *   if (payload.groupId === currentGroupId) refetch();
 * });
 * ```
 */
export function useWsEvent(
  event: string | null,
  callback: (payload: Record<string, unknown>, event: string) => void,
): void {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; });

  useEffect(() => {
    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type !== "notification") return;
      const notification = msg as unknown as WsNotification;
      if (event === null || notification.event === event) {
        callbackRef.current(notification.payload, notification.event);
      }
    });
    return unsubscribe;
  }, [event]);
}

/**
 * 複数の WS イベントを一括購読する。
 *
 * @param events - イベント名の配列
 * @param callback - 通知受信時のコールバック
 *
 * @example
 * ```tsx
 * useWsEvents(
 *   ["group.event_created", "group.event_updated", "group.event_deleted"],
 *   (payload, event) => refetch(),
 * );
 * ```
 */
export function useWsEvents(
  events: string[],
  callback: (payload: Record<string, unknown>, event: string) => void,
): void {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; });

  const eventsKey = events.join(",");

  useEffect(() => {
    const eventSet = new Set(eventsKey.split(","));

    const unsubscribe = wsClient.onMessage((msg) => {
      if (msg.type !== "notification") return;
      const notification = msg as unknown as WsNotification;
      if (eventSet.has(notification.event)) {
        callbackRef.current(notification.payload, notification.event);
      }
    });
    return unsubscribe;
  }, [eventsKey]);
}
