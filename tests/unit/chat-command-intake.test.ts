import { describe, it, expect } from "vitest";
import { generateKeyPairSync, sign } from "node:crypto";
import { validDiscordSignature } from "../../modules/task/chat/discord-signature.js";
import { requireIntakeInformation } from "../../modules/task/chat/intake-requirements.js";
import Database from "better-sqlite3";
import { chatDdl } from "../../src/db/chat-migration.js";
import { sqliteGateDatabase } from "../../src/db/sprint-gate-database.js";
import { ChatRecords } from "../../modules/task/chat/records.js";
import { IntakeStore } from "../../modules/task/chat/intake-store.js";
import { discordIncoming, discordTarget, COMMAND_RECEIPT } from "../../modules/task/chat/discord-intake.js";
import { backlogInteractionResponse } from "../../modules/task/chat/discord-commands.js";
import type { DiscordMessage } from "../../modules/task/chat/discord-rest.js";
import type { Intake, Message } from "../../modules/task/chat/contracts.js";

const now = new Date("2026-09-27T12:00:00Z");
const raw: DiscordMessage = { id: "10001", channel_id: "20001", content: "", timestamp: now.toISOString(), edited_timestamp: null, author: { id: "40001" }, attachments: [] };
const incoming = (m: DiscordMessage) => discordIncoming(m, "30001", "20001", null, "50001");
describe("explicit Discord backlog requests", () => {
  it("asks for required fields even when the LLM returns no questions", () => {
    expect(requireIntakeInformation({ title: "案", purpose: "", change: "", acceptance: [], questions: [], concerns: [] }).questions).toHaveLength(3);
  });
  it("authenticates exact interaction bytes and rejects stale or invalid signatures", () => {
    const keys = generateKeyPairSync("ed25519"), body = '{"type":1}', timestamp = String(now.getTime() / 1000);
    const key = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32).toString("hex");
    const signature = sign(null, Buffer.from(timestamp + body), keys.privateKey).toString("hex");
    expect(validDiscordSignature(body, timestamp, signature, key, now.getTime())).toBe(true);
    expect(validDiscordSignature(body + " ", timestamp, signature, key, now.getTime())).toBe(false);
    expect(validDiscordSignature(body, timestamp, signature, key, now.getTime() + 300001)).toBe(false);
    expect(validDiscordSignature(body, timestamp, "bad", key, now.getTime())).toBe(false);
  });
  it("uses only the configured bot mention and preserves reply target", () => {
    expect(incoming({ ...raw, content: "<@50001> バックログ追加 改善" }).intakeRequest?.text).toBe("改善");
    expect(incoming({ ...raw, content: "<@99999> バックログ追加 改善" }).intakeRequest).toBeUndefined();
    expect(incoming({ ...raw, content: "<@50001> こんにちは" }).intakeRequest).toBeUndefined();
    expect(incoming({ ...raw, content: "++バックログ", message_reference: { message_id: "10000", channel_id: "20001" } }).intakeRequest?.target?.messageId).toBe("10000");
    expect(discordTarget("https://discord.com/channels/99999/20001/10000", "30001")).toBeNull();
  });
  it("accepts only this application's real command receipt", () => {
    const receipt = { ...raw, author: { id: "50001", bot: true }, webhook_id: "50001", application_id: "50001", interaction_metadata: { type: 2 }, embeds: [{ description: "改善", footer: { text: COMMAND_RECEIPT } }] };
    expect(incoming(receipt).intakeRequest?.text).toBe("改善");
    expect(incoming({ ...receipt, author: { id: "99999", bot: true } }).intakeRequest).toBeUndefined();
    expect(incoming({ ...receipt, interaction_metadata: undefined }).intakeRequest).toBeUndefined();
    expect(incoming({ ...raw, content: "++バックログ追加 偽装", author: { id: "99999", bot: true } }).intakeRequest).toBeUndefined();
  });
  it("publishes successful commands, but rejects cross-channel links privately", () => {
    const response = backlogInteractionResponse({ type: 2, guild_id: "30001", channel_id: "20001", data: { name: "バックログに追加", type: 3, target_id: "10000" } });
    expect(response).toMatchObject({ data: { embeds: [{ description: "https://discord.com/channels/30001/20001/10000" }] } });
    const rejected = backlogInteractionResponse({ type: 2, guild_id: "30001", channel_id: "20001", data: { name: "backlog", type: 1, options: [{ name: "add", options: [{ name: "message", value: "https://discord.com/channels/30001/99999/10000" }] }] } });
    expect(rejected).toMatchObject({ data: { flags: 64 } });
  });
  it("deduplicates one source across commands and follows source edits/deletion", async () => {
    const db = new Database(":memory:");
    try {
      for (const ddl of chatDdl) db.exec(ddl);
      const records = new ChatRecords(sqliteGateDatabase(db)), store = new IntakeStore(records);
      const source: Message = { ...incoming({ ...raw, id: "10000", content: "元の改善案" }), teamId: "team", actorId: null };
      await records.save("team", "message", source.id, source, now);
      const trigger: Message = { ...incoming({ ...raw, content: "++バックログ", message_reference: { message_id: source.id } }), teamId: "team", actorId: null };
      await store.receive(trigger, "20001", now);
      await store.receive({ ...trigger, id: "10002" }, "20001", now);
      let rows = await records.list<Intake>("team", "intake");
      expect(rows).toHaveLength(1); expect(rows[0].content).toBe("元の改善案");
      await store.receive({ ...source, content: "更新案" }, "20001", now);
      rows = await records.list<Intake>("team", "intake"); expect(rows[0].content).toBe("更新案");
      await store.receive({ ...source, content: "", deleted: true }, "20001", now);
      rows = await records.list<Intake>("team", "intake"); expect(rows[0].sourceDeleted).toBe(true); expect(rows[0].content).toBe("");
    } finally { db.close(); }
  });
});
