import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { chatDdl } from "../../src/db/chat-migration.js";
import { sqliteGateDatabase } from "../../src/db/sprint-gate-database.js";
import { ChatRecords } from "../../modules/task/chat/records.js";
import { ChatSetupStore } from "../../modules/task/chat/setup-store.js";
const now = new Date("2026-09-27T00:00:00Z");
const original = { teamId: "KD", platform: "discord" as const, workspaceId: "111111", backlogChannelId: "222222", dailyAt: "09:00", timezone: "Asia/Tokyo", enabled: false, joinDiscussion: false };
const destination = { ...original, workspaceId: "333333", backlogChannelId: "444444" };
function fixture() { const db = new Database(":memory:"); for (const ddl of chatDdl) db.exec(ddl); const records = new ChatRecords(sqliteGateDatabase(db)); return { db, records, store: new ChatSetupStore(records) }; }
describe("chat destination change", () => {
  it("retains logs and records old connection without changing team identity", async () => {
    const { db, records, store } = fixture();
    try {
      await store.saveConnection(original, 0, now);
      await records.save("KD", "message", "old", { content: "retained" }, now);
      await expect(store.saveConnection(destination, 1, now)).rejects.toThrow();
      const saved = await store.changeDestination(destination, 1, "owner", now);
      expect(saved.teamId).toBe("KD"); expect(saved.enabled).toBe(false); expect(saved.revision).toBe(2);
      expect(await records.get("KD", "message", "old")).toEqual({ content: "retained" });
      expect(await records.list("KD", "connection-history")).toHaveLength(1);
    } finally { db.close(); }
  });
  it.each(["intake", "surface", "outbox"])("blocks existing %s work", async kind => {
    const { db, records, store } = fixture();
    try { await store.saveConnection(original, 0, now); await records.save("KD", kind, "pending", {}, now, "unknown"); await expect(store.changeDestination(destination, 1, "owner", now)).rejects.toThrow(); }
    finally { db.close(); }
  });
  it("blocks active workers, enabled connections and stale revisions", async () => {
    const { db, records, store } = fixture();
    try {
      await store.saveConnection(original, 0, now);
      await records.lease("worker", now, 300000);
      await expect(store.changeDestination(destination, 1, "owner", now)).rejects.toThrow();
      await records.releaseLease("worker");
      await expect(store.changeDestination(destination, 2, "owner", now)).rejects.toThrow();
      await store.saveConnection({ ...original, enabled: true }, 1, now);
      await expect(store.changeDestination(destination, 2, "owner", now)).rejects.toThrow();
    } finally { db.close(); }
  });
});
