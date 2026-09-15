/**
 * 個人タスクの通知を Memoria へ送る (task-integration §2.2 / Memoria spec/interface/notifications.md)。
 * `POST {MEMORIA_URL}/api/notifications`。 WebPush + Alexa への配送は Memoria が行う。
 */

import { secretManager } from "../../../src/config/secrets.js";
import { NotificationConfigError, postJson, type NotificationSink } from "./sink.js";

export function createMemoriaSink(
  fetchImpl: typeof fetch = fetch,
  baseUrl: () => string = () => secretManager.getOrDefault("MEMORIA_URL", ""),
): NotificationSink {
  return {
    async deliver(_target, payload) {
      const base = baseUrl().replace(/\/+$/, "");
      if (!base) throw new NotificationConfigError("MEMORIA_URL is not configured");
      await postJson(fetchImpl, `${base}/api/notifications`, payload, "Memoria");
    },
  };
}
