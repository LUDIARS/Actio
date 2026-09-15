/**
 * チームの通知を Cc のチーム面カードとして送る (task-integration §2.2)。
 * `POST {CONCORDIA_URL}/v1/teams/:teamId/cards`。 投稿そのものは Cc の Discord bot が行う。
 */

import { secretManager } from "../../../src/config/secrets.js";
import { NotificationConfigError, postJson, type NotificationSink } from "./sink.js";

export function createConcordiaSink(
  fetchImpl: typeof fetch = fetch,
  baseUrl: () => string = () => secretManager.getOrDefault("CONCORDIA_URL", ""),
): NotificationSink {
  return {
    async deliver(target, payload) {
      const base = baseUrl().replace(/\/+$/, "");
      if (!base) throw new NotificationConfigError("CONCORDIA_URL is not configured");
      if (!target.teamId) throw new NotificationConfigError("Concordia notifications require a team");
      await postJson(fetchImpl, `${base}/v1/teams/${encodeURIComponent(target.teamId)}/cards`, payload, "Concordia");
    },
  };
}
