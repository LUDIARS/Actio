import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import {
  initTestDatabase,
  clearTestDatabase,
  insertTestUser,
  insertTestTasks,
  generateTestToken,
  request,
} from "../helpers.js";

// GET /api/tasks の新契約: 要約・キーセットページ・追加絞り込み (spec/feature/task-list-api.md)

let app: any;
let token: string;
let invalidateTaskListCache: () => Promise<void>;

beforeAll(async () => {
  initTestDatabase();
  const mod = await import("../../src/app.js");
  app = mod.createApp().app;
  const cache = await import("../../modules/task/cache/redis-task-list-cache.js");
  invalidateTaskListCache = () => cache.taskListCache.invalidate();
});

/** DB へ直接入れた行は書き込み通知を通らないので、 一覧キャッシュを手で捨てる */
async function insertTasks(rows: Parameters<typeof insertTestTasks>[0]) {
  insertTestTasks(rows);
  await invalidateTaskListCache();
}

beforeEach(async () => {
  clearTestDatabase();
  await invalidateTaskListCache();
  insertTestUser({ id: "user-1", name: "TaskUser", email: "task@test.com" });
  insertTestUser({ id: "user-2", name: "Other", email: "other@test.com" });
  token = generateTestToken("user-1");
});

const BASE = Date.UTC(2026, 9, 1);
const at = (minutes: number) => new Date(BASE + minutes * 60_000);

/** updated_at が 1 分ずつ新しくなる n 件 (task-0 が最も古い) */
async function seed(n: number, extra: (i: number) => Partial<Parameters<typeof insertTestTasks>[0][number]> = () => ({})) {
  await insertTasks(Array.from({ length: n }, (_, i) => ({
    id: `task-${String(i).padStart(5, "0")}`,
    ownerId: "user-1",
    title: `Task ${i}`,
    createdAt: at(i),
    updatedAt: at(i),
    ...extra(i),
  })));
}

async function list(query: string) {
  return request(app, "GET", `/api/tasks${query ? `?${query}` : ""}`, { token });
}

async function collectAll(query: string): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  for (let guard = 0; guard < 100; guard++) {
    const res = await list(`${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
    expect(res.status).toBe(200);
    ids.push(...res.json.tasks.map((t: { id: string }) => t.id));
    cursor = res.json.nextCursor;
    if (cursor === null) return ids;
  }
  throw new Error("pagination did not terminate");
}

describe("GET /api/tasks summary", () => {
  it("returns summaries without body fields, keeps pluginPayload, and full text stays on GET /:id", async () => {
    const created = await request(app, "POST", "/api/tasks", {
      token,
      body: {
        title: "AI 委託", description: "長い依頼文", requirements: "要件", kind: "issue", publicSummary: "公開要約",
        pluginId: "cc", pluginRef: "r1", pluginPayload: { runs: [{ id: "run-1" }] },
      },
    });
    expect(created.status).toBe(201);

    const res = await list("kind=all");
    expect(res.status).toBe(200);
    expect(res.json.nextCursor).toBeNull();
    const [task] = res.json.tasks;
    expect(task.title).toBe("AI 委託");
    expect(task.pluginPayload).toEqual({ runs: [{ id: "run-1" }] });
    for (const field of ["description", "requirements", "completionEvidence", "publicSummary"]) {
      expect(task).not.toHaveProperty(field);
    }

    const detail = await request(app, "GET", `/api/tasks/${task.id}`, { token });
    expect(detail.json.task.description).toBe("長い依頼文");
    expect(detail.json.task.requirements).toBe("要件");
  });

  it("includes description only with include=description", async () => {
    await request(app, "POST", "/api/tasks", { token, body: { title: "x", description: "本文" } });
    const res = await list("include=description");
    expect(res.json.tasks[0].description).toBe("本文");
    expect(res.json.tasks[0]).not.toHaveProperty("requirements");
  });

  it("format=memoria returns summaries with details only on include=description", async () => {
    await request(app, "POST", "/api/tasks", { token, body: { title: "m", description: "メモ", status: "doing" } });
    const plain = await list("format=memoria");
    expect(plain.json.items[0].details).toBeNull();
    expect(plain.json.items[0].status).toBe("doing");
    expect(plain.json.nextCursor).toBeNull();
    const full = await list("format=memoria&include=description");
    expect(full.json.items[0].details).toBe("メモ");
  });
});

describe("GET /api/tasks keyset pagination", () => {
  it("defaults to 100 per page ordered by updated_at desc", async () => {
    await seed(130);
    const first = await list("");
    expect(first.json.tasks).toHaveLength(100);
    expect(first.json.tasks[0].id).toBe("task-00129");
    expect(typeof first.json.nextCursor).toBe("string");
    const second = await list(`cursor=${encodeURIComponent(first.json.nextCursor)}`);
    expect(second.json.tasks).toHaveLength(30);
    expect(second.json.tasks[0].id).toBe("task-00029");
    expect(second.json.nextCursor).toBeNull();
  });

  it("walks every row exactly once even when updated_at ties", async () => {
    // 3 件ずつ同じ updated_at (id で順序が決まる)
    await seed(10, (i) => ({ updatedAt: at(Math.floor(i / 3)) }));
    const ids = await collectAll("limit=2");
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    const single = await list("limit=500");
    expect(ids).toEqual(single.json.tasks.map((t: { id: string }) => t.id));
  });

  it("pages sort=personal in the personal board order", async () => {
    const statuses = ["done", "open", "in_progress", "cancelled", "open"];
    await seed(12, (i) => ({
      status: statuses[i % statuses.length],
      deadline: i % 3 === 0 ? null : at(1000 - (i % 4)),
    }));
    const single = await list("sort=personal&limit=500");
    const expected = single.json.tasks.map((t: { id: string }) => t.id);
    expect(single.json.tasks[0].status).toBe("open");
    expect(await collectAll("sort=personal&limit=5")).toEqual(expected);
  });

  it("rejects a default cursor on sort=personal and malformed cursors", async () => {
    await seed(3);
    const first = await list("limit=1");
    expect((await list(`sort=personal&cursor=${encodeURIComponent(first.json.nextCursor)}`)).status).toBe(400);
    expect((await list("cursor=not-a-cursor!")).status).toBe(400);
    expect((await list("cursor=eyJ2IjoxfQ")).status).toBe(400);
  });

  it("validates limit", async () => {
    expect((await list("limit=500")).status).toBe(200);
    expect((await list("limit=501")).status).toBe(400);
    expect((await list("limit=0")).status).toBe(400);
    expect((await list("limit=abc")).status).toBe(400);
  });
});

describe("GET /api/tasks filters", () => {
  beforeEach(async () => {
    await insertTasks([
      { id: "a", ownerId: "user-1", title: "Fix Login Bug", status: "open", category: "開発, 学習", assigneeId: "user-2", deadline: at(100), createdAt: at(1), updatedAt: at(1) },
      { id: "b", ownerId: "user-1", title: "write docs", status: "in_progress", category: "ドキュメント", deadline: at(300), createdAt: at(2), updatedAt: at(50) },
      { id: "c", ownerId: "user-1", title: "100%_done", status: "done", category: "開発", createdAt: at(3), updatedAt: at(3) },
    ]);
  });

  const ids = async (query: string) => (await list(query)).json.tasks.map((t: { id: string }) => t.id).sort();

  it("q matches title substrings case-insensitively and treats LIKE wildcards literally", async () => {
    expect(await ids("q=login")).toEqual(["a"]);
    expect(await ids("q=DOCS")).toEqual(["b"]);
    expect(await ids("q=%25_")).toEqual(["c"]);
    expect(await ids("q=_")).toEqual(["c"]);
  });

  it("status accepts a comma-separated list (aliases allowed)", async () => {
    expect(await ids("status=open,done")).toEqual(["a", "c"]);
    expect(await ids("status=doing")).toEqual(["b"]);
  });

  it("category matches one entry of the comma-separated list", async () => {
    expect(await ids("category=開発")).toEqual(["a", "c"]);
    expect(await ids("category=学習")).toEqual(["a"]);
    expect(await ids("category=開")).toEqual([]);
  });

  it("assignee, updated_since and due_after narrow the list", async () => {
    expect(await ids("assignee=user-2")).toEqual(["a"]);
    expect(await ids(`updated_since=${encodeURIComponent(at(3).toISOString())}`)).toEqual(["b", "c"]);
    expect(await ids(`due_after=${encodeURIComponent(at(200).toISOString())}`)).toEqual(["b"]);
  });

  it("rejects invalid filter values with 400", async () => {
    for (const query of ["status=bogus", "status=open,", "updated_since=yesterday", "due_after=2026-13-45", "include=requirements"]) {
      expect((await list(query)).status, query).toBe(400);
    }
  });

  it("keeps cached pages separate per filter and page parameters", async () => {
    expect(await ids("status=open")).toEqual(["a"]);
    expect(await ids("status=done")).toEqual(["c"]);
    expect((await list("limit=1")).json.tasks).toHaveLength(1);
    expect((await list("limit=2")).json.tasks).toHaveLength(2);
  });
});

describe("GET /api/tasks at scale", () => {
  it("returns the default page of 10,000 tasks with large bodies within 1 second", async () => {
    const body = "依頼文".repeat(700); // ~6KB/件 → 全件なら 60MB 超
    await seed(10_000, () => ({ description: body }));
    await list("limit=1"); // 接続・キャッシュの初期化を除いて計る
    const started = performance.now();
    const res = await list("");
    const elapsed = performance.now() - started;
    expect(res.status).toBe(200);
    expect(res.json.tasks).toHaveLength(100);
    expect(typeof res.json.nextCursor).toBe("string");
    expect(JSON.stringify(res.json).length).toBeLessThan(200_000);
    expect(elapsed).toBeLessThan(1000);
  }, 60_000);
});
