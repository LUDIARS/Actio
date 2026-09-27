// @implements AT-SPRINT-CHAT-INTEGRATION
import { timingSafeEqual } from "node:crypto";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { chatRecords } from "../../../src/db/chat-repository.js";
import { secretManager } from "../../../src/config/secrets.js";
import type { Connection } from "./contracts.js";
import { chatMode } from "./providers.js";
import { backlogInteractionResponse, type BacklogInteraction } from "./discord-commands.js";

import { validDiscordSignature } from "./discord-signature.js";

export const chatCommandRoutes = new Hono();
chatCommandRoutes.use("*", bodyLimit({ maxSize: 64000 }));
chatCommandRoutes.onError((_error, c) => c.json({ error: "command_unavailable" }, 503));
// Read-only admission check used by Cc before acknowledging a public interaction.
chatCommandRoutes.post("/access", async c => {
  const key = secretManager.get("ACTIO_CHAT_SHARED_SECRET");
  const actual = Buffer.from(c.req.header("authorization") ?? ""), expected = Buffer.from(`Bearer ${key ?? ""}`);
  if (chatMode() !== "concordia" || !key || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return c.json({ error: "unauthorized" }, 401);
  const value = z.object({ guildId: z.string(), channelId: z.string() }).strict().safeParse(await c.req.json());
  if (!value.success) return c.json({ error: "invalid_request" }, 400);
  const rows = (await chatRecords().allOfKind<Connection>("connection")).filter(x => x.enabled && x.platform === "discord" && x.workspaceId === value.data.guildId && x.backlogChannelId === value.data.channelId);
  return c.json({ allowed: rows.length === 1 });
});
// Standalone Discord applications configure this URL in their developer portal.
chatCommandRoutes.post("/discord/:team/interactions", async c => {
  if (chatMode() !== "discord") return c.json({ error: "disabled" }, 404);
  const connection = await chatRecords().get<Connection>(c.req.param("team"), "connection", "discord");
  const key = connection?.tokenRef ? secretManager.get(connection.tokenRef + "_PUBLIC_KEY") : undefined;
  const raw = await c.req.text();
  if (!key || !validDiscordSignature(raw, c.req.header("x-signature-timestamp") ?? "", c.req.header("x-signature-ed25519") ?? "", key)) return c.json({ error: "unauthorized" }, 401);
  const input = JSON.parse(raw) as BacklogInteraction;
  if (input.type === 1) return c.json({ type: 1 });
  if (input.type !== 2 || !connection?.enabled || input.guild_id !== connection.workspaceId || input.channel_id !== connection.backlogChannelId)
    return c.json({ type: 4, data: { content: "有効なバックログ受付チャンネルで実行してください。", flags: 64 } });
  return c.json(backlogInteractionResponse(input));
});
