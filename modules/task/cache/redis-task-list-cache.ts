/**
 * タスク一覧キャッシュの実体 (プロセスで 1 つ)。
 *
 * Redis に繋がっていれば Redis を使い、未設定・停止中・認証失敗などで使えないときは
 * プロセス内のキャッシュで代える。Redis の状態に関わらず一覧は返る。
 */

import { getRedis } from "../../../src/db/redis.js";
import { onTaskWrite } from "../../../src/db/task-write-listeners.js";
import { createMemoryTaskListStore } from "./memory-task-list-store.js";
import { createTaskListCache, type TaskListCacheStore } from "./task-list-cache.js";

const memoryStore = createMemoryTaskListStore();

function resolveStore(): TaskListCacheStore {
  const redis = getRedis();
  if (!redis) return memoryStore;
  return {
    get: (key) => redis.get(key),
    set: async (key, value, ttlSec) => { await redis.set(key, value, "EX", ttlSec); },
    incr: (key) => redis.incr(key),
  };
}

export const taskListCache = createTaskListCache(resolveStore);

// 書き込みの通知で無効化する。 失敗しても書き込み自体は成功扱いのまま (TTL で追いつく)。
onTaskWrite(() => {
  taskListCache.invalidate().catch(() => undefined);
});
