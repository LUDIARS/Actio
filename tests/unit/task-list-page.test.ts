import { describe, it, expect } from "vitest";
import { parseTaskListPageQuery } from "../../modules/task/list/page-query.js";
import { decodeTaskListCursor, encodeTaskListCursor } from "../../modules/task/list/cursor.js";
import { toTaskSummary } from "../../modules/task/list/summary.js";
import { buildTaskListPage } from "../../modules/task/list/page.js";

const row = (i: number) => ({
  id: `t${i}`,
  status: "open",
  deadline: null,
  createdAt: new Date(1_000_000 + i * 1000),
  updatedAt: new Date(2_000_000 + i * 1000),
});

describe("parseTaskListPageQuery", () => {
  it("defaults to limit 100, no cursor and no description", () => {
    const result = parseTaskListPageQuery({});
    expect(result).toEqual({ ok: true, value: expect.objectContaining({ sort: "default", limit: 100, after: null, includeDescription: false, statuses: [] }) });
  });

  it("accepts limit 1..500 and rejects the rest", () => {
    expect(parseTaskListPageQuery({ limit: "500" }).ok).toBe(true);
    expect(parseTaskListPageQuery({ limit: "1" }).ok).toBe(true);
    for (const limit of ["0", "501", "-1", "1.5", "abc", ""]) {
      expect(parseTaskListPageQuery({ limit }).ok, limit).toBe(false);
    }
  });

  it("normalizes comma-separated statuses and rejects unknown ones", () => {
    const result = parseTaskListPageQuery({ status: "todo,doing,done,open" });
    expect(result.ok && result.value.statuses).toEqual(["open", "in_progress", "done"]);
    expect(parseTaskListPageQuery({ status: "open,nope" }).ok).toBe(false);
  });

  it("parses ISO 8601 dates and rejects other formats", () => {
    const result = parseTaskListPageQuery({ updated_since: "2026-10-01T00:00:00Z", due_after: "2026-10-02" });
    expect(result.ok && result.value.updatedSince?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(result.ok && result.value.dueAfter?.toISOString()).toBe("2026-10-02T00:00:00.000Z");
    expect(parseTaskListPageQuery({ updated_since: "Oct 1 2026" }).ok).toBe(false);
    expect(parseTaskListPageQuery({ due_after: "2026-02-31T99:00:00Z" }).ok).toBe(false);
  });

  it("only accepts include=description", () => {
    const result = parseTaskListPageQuery({ include: "description" });
    expect(result.ok && result.value.includeDescription).toBe(true);
    expect(parseTaskListPageQuery({ include: "requirements" }).ok).toBe(false);
  });

  it("treats blank text filters as unset", () => {
    const result = parseTaskListPageQuery({ q: "  ", category: "", assignee: " u1 " });
    expect(result.ok && [result.value.q, result.value.category, result.value.assignee]).toEqual([undefined, undefined, "u1"]);
  });

  it("decodes a cursor for the same sort only", () => {
    const cursor = encodeTaskListCursor({ sort: "personal", rank: 1, deadline: null, createdAt: 5, id: "x" });
    expect(parseTaskListPageQuery({ sort: "personal", cursor }).ok).toBe(true);
    expect(parseTaskListPageQuery({ cursor }).ok).toBe(false);
  });
});

describe("task list cursor", () => {
  it("round-trips both sorts", () => {
    const def = { sort: "default" as const, updatedAt: 1_700_000_000_000, id: "a" };
    const per = { sort: "personal" as const, rank: 2, deadline: 1_700_000_000_000, createdAt: 1, id: "b" };
    expect(decodeTaskListCursor(encodeTaskListCursor(def), "default")).toEqual(def);
    expect(decodeTaskListCursor(encodeTaskListCursor(per), "personal")).toEqual(per);
  });

  it("returns null for garbage, other versions and missing fields", () => {
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
    expect(decodeTaskListCursor("!!!", "default")).toBeNull();
    expect(decodeTaskListCursor(encode({ v: 2, sort: "default", updatedAt: 1, id: "a" }), "default")).toBeNull();
    expect(decodeTaskListCursor(encode({ v: 1, sort: "default", id: "a" }), "default")).toBeNull();
    expect(decodeTaskListCursor(encode({ v: 1, sort: "personal", rank: 0, deadline: "x", createdAt: 1, id: "a" }), "personal")).toBeNull();
    expect(decodeTaskListCursor(encode("plain"), "default")).toBeNull();
  });
});

describe("toTaskSummary", () => {
  const task = {
    id: "t", title: "T", description: "d", requirements: "r", completionEvidence: { pr: 1 }, publicSummary: "p",
    pluginPayload: { runs: [] }, status: "open",
  };

  it("drops body fields and keeps pluginPayload", () => {
    expect(toTaskSummary(task, false)).toEqual({ id: "t", title: "T", pluginPayload: { runs: [] }, status: "open" });
  });

  it("keeps description on include", () => {
    expect(toTaskSummary(task, true)).toEqual({ id: "t", title: "T", description: "d", pluginPayload: { runs: [] }, status: "open" });
  });
});

describe("buildTaskListPage", () => {
  it("returns every row with nextCursor null when rows fit the limit", () => {
    const rows = [row(1), row(2)];
    expect(buildTaskListPage(rows, 2, "default")).toEqual({ tasks: rows, nextCursor: null });
  });

  it("cuts the extra row and encodes the last row of the page", () => {
    const rows = [row(3), row(2), row(1)];
    const page = buildTaskListPage(rows, 2, "default");
    expect(page.tasks).toEqual([row(3), row(2)]);
    expect(decodeTaskListCursor(page.nextCursor as string, "default")).toEqual({ sort: "default", updatedAt: row(2).updatedAt.getTime(), id: "t2" });
  });

  it("encodes the personal key of the last row", () => {
    const rows = [{ ...row(1), status: "in_progress", deadline: new Date(5000) }, row(2)];
    const page = buildTaskListPage(rows, 1, "personal");
    expect(decodeTaskListCursor(page.nextCursor as string, "personal")).toEqual({ sort: "personal", rank: 1, deadline: 5000, createdAt: row(1).createdAt.getTime(), id: "t1" });
  });
});
