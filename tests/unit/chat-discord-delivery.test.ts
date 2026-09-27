import { describe, it, expect } from "vitest";
import { DiscordRest } from "../../modules/task/chat/discord-rest.js";
import { DiscordTransport } from "../../modules/task/chat/discord-transport.js";
import type { Connection, Operation } from "../../modules/task/chat/contracts.js";
const connection: Connection = { teamId: "team", platform: "discord", workspaceId: "100000", backlogChannelId: "200000", revision: 1, enabled: true, joinDiscussion: false, dailyAt: "09:00", timezone: "Asia/Tokyo" };
describe("Discord delivery reconciliation", () => {
  it("never reposts a message with an unknown outcome", async () => {
    let writes = 0;
    const request: typeof fetch = async (input, init) => {
      if (init?.method !== "GET") writes++;
      const path = String(input);
      if (path.endsWith("/users/@me")) return Response.json({ id: "bot" });
      if (path.includes("/messages?")) return Response.json([]);
      return Response.json({ id: "200000", guild_id: "100000", type: 0 });
    };
    const transport = new DiscordTransport(new DiscordRest("test", new AbortController().signal, request));
    const operation: Operation = { id: "operation", teamId: "team", payload: { kind: "message", channelId: "200000", text: "summary" }, state: "unknown", resultId: null, lastError: null, createdAt: "2026-09-27T00:00:00Z" };
    await expect(transport.deliver(connection, operation)).rejects.toThrow("投稿結果が不明");
    expect(writes).toBe(0);
  });
});
