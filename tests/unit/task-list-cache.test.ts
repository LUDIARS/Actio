import { describe, expect, it, vi } from "vitest";
import { createTaskListCache, taskListCacheKey, type TaskListCacheStore } from "../../modules/task/cache/task-list-cache.js";

function memoryStore(): TaskListCacheStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key) ?? null,
    set: async (key, value) => { data.set(key, value); },
    incr: async (key) => {
      const next = Number(data.get(key) ?? "0") + 1;
      data.set(key, String(next));
      return next;
    },
  };
}

describe("task list cache", () => {
  it("returns the cached body for the same filter without reloading", async () => {
    const store = memoryStore();
    const cache = createTaskListCache(() => store);
    const load = vi.fn(async () => JSON.stringify({ tasks: [{ id: "a" }] }));

    await cache.getOrLoad({ ownerId: "u1" }, load);
    const second = await cache.getOrLoad({ ownerId: "u1" }, load);

    expect(second).toBe(JSON.stringify({ tasks: [{ id: "a" }] }));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("reloads after invalidate so writes are visible", async () => {
    const store = memoryStore();
    const cache = createTaskListCache(() => store);
    let version = 0;
    const load = vi.fn(async () => JSON.stringify({ v: ++version }));

    await cache.getOrLoad({ ownerId: "u1" }, load);
    await cache.invalidate();
    const after = await cache.getOrLoad({ ownerId: "u1" }, load);

    expect(JSON.parse(after)).toEqual({ v: 2 });
  });

  it("merges concurrent identical requests into one load even without Redis", async () => {
    const cache = createTaskListCache(() => null);
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const load = vi.fn(async () => { await gate; return "{}"; });

    const pending = Promise.all([cache.getOrLoad({ teamId: "t" }, load), cache.getOrLoad({ teamId: "t" }, load)]);
    release?.();
    await pending;

    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to the loader when the store fails", async () => {
    const failing: TaskListCacheStore = {
      get: async () => { throw new Error("down"); },
      set: async () => { throw new Error("down"); },
      incr: async () => { throw new Error("down"); },
    };
    const cache = createTaskListCache(() => failing);

    await expect(cache.getOrLoad({ ownerId: "u1" }, async () => "{\"tasks\":[]}")).resolves.toBe("{\"tasks\":[]}");
    await expect(cache.invalidate()).resolves.toBeUndefined();
  });

  it("does not wait on a slow store beyond its timeout", async () => {
    const slow: TaskListCacheStore = {
      get: () => new Promise(() => undefined),
      set: () => new Promise(() => undefined),
      incr: () => new Promise(() => undefined),
    };
    const cache = createTaskListCache(() => slow, { storeTimeoutMs: 20 });

    await expect(cache.getOrLoad({ ownerId: "u1" }, async () => "ok")).resolves.toBe("ok");
  });

  it("builds keys independent of property order and distinct per filter", () => {
    expect(taskListCacheKey({ a: 1, b: "x" })).toBe(taskListCacheKey({ b: "x", a: 1 }));
    expect(taskListCacheKey({ ownerId: "u1" })).not.toBe(taskListCacheKey({ ownerId: "u2" }));
    expect(taskListCacheKey({ ownerId: "u1", format: undefined })).toBe(taskListCacheKey({ ownerId: "u1" }));
  });
});
