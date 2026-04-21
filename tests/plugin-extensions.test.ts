/**
 * Issue #111 D1 / D2 / D5 / D7 / S7 / S8 — ユニット/ロジック テスト
 *
 * Host 側の単体モジュールをそのまま検証する. REST route レベルは
 * tests/api/plugin-ext-api.test.ts に分けて書く.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { defineModule } from "@ludiars/schedula-sdk";
import { EventBus } from "../src/plugins/event-bus.js";
import { customFieldRegistry, CustomFieldError } from "../src/plugins/custom-fields.js";
import { workflowRegistry, WorkflowError } from "../src/plugins/workflow.js";
import { composePluginTablesSQL } from "../src/plugins/tables.js";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ─── D5 — event bus ──────────────────────────────────────────

describe("Issue #111 D5 — EventBus", () => {
  it("delivers payloads to subscribers with source tag", async () => {
    const bus = new EventBus();
    const received: Array<{ topic: string; source: string; payload: unknown }> = [];
    bus.subscribe("x.event", "A", async (p, s) => { received.push({ topic: "x.event", source: s, payload: p }); });
    bus.subscribe("x.event", "B", async (p, s) => { received.push({ topic: "x.event", source: s, payload: p }); });
    await bus.emit("x.event", { n: 1 }, "producer");
    expect(received).toHaveLength(2);
    expect(received[0]!.source).toBe("producer");
  });

  it("isolates throwing handlers from the rest", async () => {
    const bus = new EventBus();
    const ok: string[] = [];
    bus.subscribe("t", "bad", async () => { throw new Error("boom"); });
    bus.subscribe("t", "good", async () => { ok.push("hit"); });
    await bus.emit("t", null, "src");
    expect(ok).toEqual(["hit"]);
  });

  it("dispose functions remove subscribers", async () => {
    const bus = new EventBus();
    const ok: number[] = [];
    const off = bus.subscribe("t", "s", async () => { ok.push(1); });
    await bus.emit("t", null, "src"); expect(ok).toEqual([1]);
    off();
    await bus.emit("t", null, "src"); expect(ok).toEqual([1]);
  });
});

// ─── D1 — custom fields validation ───────────────────────────

describe("Issue #111 D1 — customFieldRegistry", () => {
  beforeEach(() => customFieldRegistry.__clearForTest());

  it("validates required + type", () => {
    customFieldRegistry.register("m", "priority", {
      id: "priority", label: "Priority", type: "select", target: "task",
      options: [{ value: "low", label: "Low" }, { value: "high", label: "High" }],
      required: true,
    });
    expect(() => customFieldRegistry.validate("m", "priority", "task", null))
      .toThrow(/required/i);
    expect(() => customFieldRegistry.validate("m", "priority", "task", 42))
      .toThrow(CustomFieldError);
    expect(() => customFieldRegistry.validate("m", "priority", "task", "mid"))
      .toThrow(/not a valid option/i);
    expect(() => customFieldRegistry.validate("m", "priority", "task", "high"))
      .not.toThrow();
  });

  it("rejects targets the field does not declare", () => {
    customFieldRegistry.register("m", "eta", {
      id: "eta", label: "ETA", type: "date", target: "task",
    });
    expect(() => customFieldRegistry.validate("m", "eta", "event", "2026-05-01"))
      .toThrow(/cannot be attached/i);
  });

  it("allows multi_select subset of options", () => {
    customFieldRegistry.register("m", "tags", {
      id: "tags", label: "Tags", type: "multi_select", target: "both",
      options: [{ value: "a", label: "A" }, { value: "b", label: "B" }],
    });
    expect(() => customFieldRegistry.validate("m", "tags", "event", ["a"])).not.toThrow();
    expect(() => customFieldRegistry.validate("m", "tags", "event", ["a", "c"])).toThrow(/valid option/i);
    expect(() => customFieldRegistry.validate("m", "tags", "event", "a"))
      .toThrow(/string\[\]/i);
  });
});

// ─── D2 — workflow transitions ───────────────────────────────

describe("Issue #111 D2 — workflowRegistry", () => {
  beforeEach(() => workflowRegistry.__clearForTest());

  it("rejects transitions not declared", () => {
    workflowRegistry.register("m", {
      target: "task",
      states: ["open", "in_progress", "done"],
      initial: "open",
      transitions: [
        { from: "open", to: "in_progress" },
        { from: "in_progress", to: "done" },
      ],
    });
    expect(() => workflowRegistry.assertTransition("task", "open", "done", "general"))
      .toThrow(WorkflowError);
    expect(() => workflowRegistry.assertTransition("task", "open", "in_progress", "general"))
      .not.toThrow();
  });

  it("enforces requireRole", () => {
    workflowRegistry.register("m", {
      target: "task",
      states: ["open", "approved"],
      initial: "open",
      transitions: [
        { from: "open", to: "approved", requireRole: "system_admin" },
      ],
    });
    expect(() => workflowRegistry.assertTransition("task", "open", "approved", "group_owner"))
      .toThrow(/system_admin/i);
    expect(() => workflowRegistry.assertTransition("task", "open", "approved", "system_admin"))
      .not.toThrow();
  });

  it("no-op when no workflow registered (free-form status)", () => {
    expect(() => workflowRegistry.assertTransition("task", "whatever", "anything", "general"))
      .not.toThrow();
  });
});

// ─── D8 — plugin-owned tables schema composition ─────────────

describe("Issue #111 D8 — composePluginTablesSQL", () => {
  it("emits CREATE TABLE IF NOT EXISTS for each declared table", () => {
    const demoTable = sqliteTable("demo_widgets", {
      id:   text("id").primaryKey(),
      name: text("name").notNull(),
      count: integer("count"),
    });
    const def = defineModule({
      id: "d8-demo", name: "d8-demo",
      schedulaApiVersion: "^1.0.0", scope: "global",
      tables: { demoTable },
    });
    const out = composePluginTablesSQL(def);
    expect(out).toHaveLength(1);
    const { sql } = out[0]!;
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "demo_widgets"/);
    expect(sql).toMatch(/"id" TEXT PRIMARY KEY/);
    expect(sql).toMatch(/"name" TEXT NOT NULL/);
    expect(sql).toMatch(/"count" INTEGER/);
  });
});
