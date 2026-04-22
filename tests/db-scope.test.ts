/**
 * Issue #111 S3 — module-scoped Drizzle proxy
 *
 * 実 Drizzle は ORM の挙動 (builder chain) が重く、ここでは最低限の
 * モック db でトップレベル API (select / insert / update / delete)
 * がスコープ外テーブルを弾くことだけを検証する。
 */

import { describe, it, expect } from "vitest";
import { makeScopedDb, DbScopeError } from "../src/plugins/db-scope.js";

function fakeTable(name: string) {
  return { _: { name } };
}

function fakeDb() {
  const calls: Array<{ op: string; table?: unknown }> = [];
  return {
    calls,
    select: (_fields?: unknown) => {
      return {
        from: (t: unknown) => {
          calls.push({ op: "select.from", table: t });
          return { where: () => [{ rowCount: 1 }] };
        },
      };
    },
    insert: (t: unknown) => {
      calls.push({ op: "insert", table: t });
      return { values: () => ({ returning: () => [{ id: "x" }] }) };
    },
    update: (t: unknown) => {
      calls.push({ op: "update", table: t });
      return { set: () => ({ where: () => 1 }) };
    },
    delete: (t: unknown) => {
      calls.push({ op: "delete", table: t });
      return { where: () => 1 };
    },
    execute: () => "passthrough",
  };
}

describe("Issue #111 S3 — makeScopedDb", () => {
  it("allows CRUD on declared tables", () => {
    const myTable = fakeTable("my_table");
    const raw = fakeDb();
    const scoped = makeScopedDb(raw, "mod", [myTable]) as typeof raw;

    expect(() => scoped.select().from(myTable)).not.toThrow();
    expect(() => scoped.insert(myTable)).not.toThrow();
    expect(() => scoped.update(myTable)).not.toThrow();
    expect(() => scoped.delete(myTable)).not.toThrow();
    expect(raw.calls.map((c: { op: string }) => c.op)).toEqual([
      "select.from", "insert", "update", "delete",
    ]);
  });

  it("rejects CRUD on undeclared tables", () => {
    const declared = fakeTable("owned");
    const foreign  = fakeTable("users");
    const scoped = makeScopedDb(fakeDb(), "mod", [declared]) as ReturnType<typeof fakeDb>;

    expect(() => scoped.select().from(foreign)).toThrow(DbScopeError);
    expect(() => scoped.insert(foreign)).toThrow(DbScopeError);
    expect(() => scoped.update(foreign)).toThrow(DbScopeError);
    expect(() => scoped.delete(foreign)).toThrow(DbScopeError);
  });

  it("closes DB entirely when the module declares no tables", () => {
    const anyTable = fakeTable("anything");
    const scoped = makeScopedDb(fakeDb(), "mod", []) as ReturnType<typeof fakeDb>;
    expect(() => scoped.select().from(anyTable)).toThrow(/closed/);
    expect(() => scoped.insert(anyTable)).toThrow(/closed/);
  });

  it("passes execute() straight through (caveat)", () => {
    const scoped = makeScopedDb(fakeDb(), "mod", [fakeTable("x")]) as ReturnType<typeof fakeDb>;
    expect(scoped.execute()).toBe("passthrough");
  });
});
