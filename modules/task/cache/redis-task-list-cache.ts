/**
 * Redis を裏に持つタスク一覧キャッシュの実体 (プロセスで 1 つ)。
 */

import { getRedis } from "../../../src/db/redis.js";
import { onTaskWrite } from "../../../src/db/task-write-listeners.js";
import { createTaskListCache, type TaskListCacheStore } from "./task-list-cache.js";

function resolveRedisStore(): TaskListCacheStore | null {
  const redis = getRedis();
  if (!redis) return null;
  return {
    get: (key) => redis.get(key),
    set: async (key, value, ttlSec) => { await redis.set(key, value, "EX", ttlSec); },
    incr: (key) => redis.incr(key),
  };
}

export const taskListCache = createTaskListCache(resolveRedisStore);

// 書き込みの通知で無効化する。 失敗しても書き込み自体は成功扱いのまま (TTL で追いつく)。
onTaskWrite(() => {
  taskListCache.invalidate().catch(() => undefined);
});
