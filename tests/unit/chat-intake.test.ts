import { describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { chatDdl } from "../../src/db/chat-migration.js";
import { sqliteGateDatabase } from "../../src/db/sprint-gate-database.js";
import { ChatRecords } from "../../modules/task/chat/records.js";
import { IntakeStore } from "../../modules/task/chat/intake-store.js";
import { ChatOutbox } from "../../modules/task/chat/outbox.js";
import { backlogCommand } from "../../modules/task/chat/triggers.js";
import { localClock } from "../../modules/task/chat/summary.js";
import type { Message, Intake } from "../../modules/task/chat/contracts.js";

describe("chat intake and recovery", () => {
  it("only treats leading explicit commands as intake", () => {
    expect(backlogCommand("普通の議論です")).toBeNull();
    expect(backlogCommand("> ++バックログ追加 引用")).toBeNull();
    expect(backlogCommand("++バックログ追加 ログを検索したい")).toBe("ログを検索したい");
  });
  it("deduplicates receipt and preserves unknown delivery rather than requeueing", async () => {
    const db = new Database(":memory:");
    try {
      for (const ddl of chatDdl) db.exec(ddl);
      const records = new ChatRecords(sqliteGateDatabase(db));
      const store = new IntakeStore(records), now = new Date("2026-09-27T00:00:00Z");
      const message: Message = { id: "1", teamId: "team", channelId: "channel", parentId: null, content: "++バックログ追加 検索機能", actorId: null, bot: false, deleted: false, occurredAt: now.toISOString(), editedAt: null, url: "https://example.invalid", attachments: [] };
      await store.receive({ ...message, content: "普通の会話" }, "channel", now);
      expect(await records.list("team", "intake")).toHaveLength(0);
      await store.receive(message, "channel", now);
      await store.receive(message, "channel", now);
      const intakes = await records.list<Intake>("team", "intake");
      expect(intakes).toHaveLength(1); expect(intakes[0].revision).toBe(1);
      const outbox = new ChatOutbox(records), pending = await outbox.pending("team");
      expect(pending).toHaveLength(2);
      const claimed = await outbox.claim(pending[0], now); expect(claimed?.state).toBe("queued");
      await outbox.finish(pending[0], new Error("response lost"), now);
      expect((await outbox.claim(pending[0], now))?.state).toBe("unknown");
      await store.receive({ ...message, content: "", deleted: true }, "channel", now);
      const deleted = await records.get<Intake>("team", "intake", intakes[0].id);
      expect(deleted?.sourceDeleted).toBe(true); expect(deleted?.content).toBe("");
      expect(await records.lease("first", now, 1000)).toBe(true);
      expect(await records.lease("second", now, 1000)).toBe(false);
      expect(await records.lease("second", new Date(now.getTime() + 1001), 1000)).toBe(true);
    } finally { db.close(); }
  });
  it("uses the team's local calendar date at the daily boundary", () => {
    expect(localClock(new Date("2026-09-27T00:00:00Z"), "Asia/Tokyo")).toEqual({ date: "2026-09-27", time: "09:00" });
    expect(localClock(new Date("2026-09-26T23:59:00Z"), "Asia/Tokyo").time).toBe("08:59");
  });
});
