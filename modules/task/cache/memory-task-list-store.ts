/**
 * Redis が無い・繋がらないときに使うプロセス内のキャッシュ置き場。
 *
 * 一覧本文は大きい (全件取得で十数 MB) ため、件数と合計サイズに上限を置き、
 * 超えたら古いものから捨てる。期限切れは読むときに捨てる。
 */

import type { TaskListCacheStore } from "./task-list-cache.js";

export interface MemoryStoreOptions {
  maxEntries?: number;
  maxTotalBytes?: number;
  now?: () => number;
}

interface Entry {
  value: string;
  bytes: number;
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 64;
const DEFAULT_MAX_TOTAL_BYTES = 128 * 1024 * 1024;

export function createMemoryTaskListStore(options: MemoryStoreOptions = {}): TaskListCacheStore {
  const maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  const maxTotalBytes = options.maxTotalBytes ?? DEFAULT_MAX_TOTAL_BYTES;
  const now = options.now ?? Date.now;
  // Map は挿入順を保つので、先頭が最も古い
  const entries = new Map<string, Entry>();
  const counters = new Map<string, number>();
  let totalBytes = 0;

  function remove(key: string): void {
    const entry = entries.get(key);
    if (!entry) return;
    totalBytes -= entry.bytes;
    entries.delete(key);
  }

  function evict(): void {
    for (const key of entries.keys()) {
      if (entries.size <= maxEntries && totalBytes <= maxTotalBytes) return;
      remove(key);
    }
  }

  return {
    async get(key) {
      if (counters.has(key)) return String(counters.get(key));
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expiresAt <= now()) {
        remove(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSec) {
      // 文字数は UTF-16 単位なので、上限の判定は概算 (2 倍) で行う
      const bytes = value.length * 2;
      remove(key);
      if (bytes > maxTotalBytes) return;
      entries.set(key, { value, bytes, expiresAt: now() + ttlSec * 1000 });
      totalBytes += bytes;
      evict();
    },
    async incr(key) {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    },
  };
}
