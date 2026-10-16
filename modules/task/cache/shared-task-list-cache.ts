/**
 * タスク一覧キャッシュの実体 (プロセスで 1 つ)。
 *
 * プロセス内のキャッシュ置き場を使う。外部のキャッシュサービスには依存しない
 * (2026-10-16 Redis 依存を廃止)。
 */

import { onTaskWrite } from "../../../src/db/task-write-listeners.js";
import { createMemoryTaskListStore } from "./memory-task-list-store.js";
import { createTaskListCache } from "./task-list-cache.js";

const memoryStore = createMemoryTaskListStore();

export const taskListCache = createTaskListCache(() => memoryStore);

// 書き込みの通知で無効化する。 失敗しても書き込み自体は成功扱いのまま (TTL で追いつく)。
onTaskWrite(() => {
  taskListCache.invalidate().catch(() => undefined);
});
