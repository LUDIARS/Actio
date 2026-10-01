import { describe, expect, it } from "vitest";
import { createMemoryTaskListStore } from "../../modules/task/cache/memory-task-list-store.js";
import { createTaskListCache } from "../../modules/task/cache/task-list-cache.js";

describe("memory task list store", () => {
  it("returns stored values until the ttl passes", async () => {
    let clock = 1_000;
    const store = createMemoryTaskListStore({ now: () => clock });

    await store.set("k", "body", 15);
    expect(await store.get("k")).toBe("body");

    clock += 15_000;
    expect(await store.get("k")).toBeNull();
  });

  it("drops the oldest entries beyond the entry limit", async () => {
    const store = createMemoryTaskListStore({ maxEntries: 2 });

    await store.set("a", "1", 60);
    await store.set("b", "2", 60);
    await store.set("c", "3", 60);

    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toBe("2");
    expect(await store.get("c")).toBe("3");
  });

  it("drops old entries to stay within the size limit and skips oversized values", async () => {
    // 1 文字 2 バイトの概算なので "12345" は 10 バイト。2 件で上限 15 を超える
    const store = createMemoryTaskListStore({ maxTotalBytes: 15 });

    await store.set("a", "12345", 60);
    await store.set("b", "12345", 60);
    expect(await store.get("a")).toBeNull();
    expect(await store.get("b")).toBe("12345");

    await store.set("huge", "x".repeat(50), 60);
    expect(await store.get("huge")).toBeNull();
  });

  it("counts generations", async () => {
    const store = createMemoryTaskListStore();

    expect(await store.incr("gen")).toBe(1);
    expect(await store.incr("gen")).toBe(2);
    expect(await store.get("gen")).toBe("2");
  });

  it("serves repeated list requests without Redis", async () => {
    const store = createMemoryTaskListStore();
    const cache = createTaskListCache(() => store);
    let loads = 0;
    const load = async () => { loads += 1; return "{\"tasks\":[]}"; };

    await cache.getOrLoad({ ownerId: "u1" }, load);
    await cache.getOrLoad({ ownerId: "u1" }, load);
    expect(loads).toBe(1);

    await cache.invalidate();
    await cache.getOrLoad({ ownerId: "u1" }, load);
    expect(loads).toBe(2);
  });
});
