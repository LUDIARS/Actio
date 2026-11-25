/**
 * タスク一覧の短期キャッシュ。
 *
 * Cc のワークフローは同じ一覧を短時間に繰り返し引くため、 GET /api/tasks の
 * 応答本文を Redis に短い TTL で置く。 タスクの書き込みがあると世代番号を進め、
 * 以後のキーを切り替えることで古い一覧を返さない。
 *
 * - Redis が無い / 遅い場合はキャッシュ無しで DB を引く (応答を止めない)
 * - 同一キーの同時要求は 1 回の生成にまとめる (Redis 無しでも効く)
 */

import { createHash } from "node:crypto";
import { TaskListLoadTimeoutError } from "../list/timeout.js";

export interface TaskListCacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec: number): Promise<void>;
  incr(key: string): Promise<number>;
}

export interface TaskListCacheOptions {
  ttlSec?: number;
  storeTimeoutMs?: number;
  loadTimeoutMs?: number;
}

type TaskListLoader = (signal: AbortSignal) => Promise<string>;

const KEY_PREFIX = "actio:task-list:v1";
const GENERATION_KEY = `${KEY_PREFIX}:gen`;
const DEFAULT_TTL_SEC = 15;
const DEFAULT_STORE_TIMEOUT_MS = 200;
const DEFAULT_LOAD_TIMEOUT_MS = 8_000;

export function taskListCacheKey(parts: Record<string, unknown>): string {
  const stable = JSON.stringify(
    Object.keys(parts)
      .sort()
      .filter((k) => parts[k] !== undefined)
      .map((k) => [k, parts[k] instanceof Date ? (parts[k] as Date).toISOString() : parts[k]]),
  );
  return createHash("sha1").update(stable).digest("hex");
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  timeoutError: () => Error = () => new Error(`task-list cache store timeout (${ms}ms)`),
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(timeoutError()), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err: unknown) => { clearTimeout(timer); reject(err); },
    );
  });
}

export function createTaskListCache(
  resolveStore: () => TaskListCacheStore | null,
  options: TaskListCacheOptions = {},
) {
  const ttlSec = options.ttlSec ?? DEFAULT_TTL_SEC;
  const timeoutMs = options.storeTimeoutMs ?? DEFAULT_STORE_TIMEOUT_MS;
  const loadTimeoutMs = options.loadTimeoutMs ?? DEFAULT_LOAD_TIMEOUT_MS;
  // Redis 不在時もプロセス内で世代を進め、 同時要求まとめの取り違えを防ぐ
  let localGeneration = 0;
  const inflight = new Map<string, Promise<string>>();

  async function readGeneration(store: TaskListCacheStore | null): Promise<string> {
    if (!store) return `l${localGeneration}`;
    try {
      const gen = await withTimeout(store.get(GENERATION_KEY), timeoutMs);
      return `r${gen ?? "0"}:l${localGeneration}`;
    } catch {
      return `l${localGeneration}`;
    }
  }

  async function produce(store: TaskListCacheStore | null, key: string, load: TaskListLoader): Promise<string> {
    if (store) {
      try {
        const hit = await withTimeout(store.get(key), timeoutMs);
        if (hit !== null) return hit;
      } catch {
        // キャッシュ読み失敗は DB へ落とす
      }
    }
    const deadline = new AbortController();
    const body = await withTimeout(Promise.resolve().then(() => load(deadline.signal)), loadTimeoutMs, () => {
      const error = new TaskListLoadTimeoutError(loadTimeoutMs);
      deadline.abort(error);
      console.warn(`[task-list] page load timed out timeout_ms=${loadTimeoutMs}`);
      return error;
    });
    if (store) {
      withTimeout(store.set(key, body, ttlSec), timeoutMs).catch(() => undefined);
    }
    return body;
  }

  return {
    /** 一覧の JSON 本文を返す。 キャッシュに無ければ load() で作って置く。 */
    async getOrLoad(parts: Record<string, unknown>, load: TaskListLoader): Promise<string> {
      const store = resolveStore();
      const generation = await readGeneration(store);
      const key = `${KEY_PREFIX}:${generation}:${taskListCacheKey(parts)}`;
      const pending = inflight.get(key);
      if (pending) return pending;
      const job: Promise<string> = produce(store, key, load).finally(() => {
        if (inflight.get(key) === job) inflight.delete(key);
      });
      inflight.set(key, job);
      return job;
    },

    /** タスクの書き込み後に呼ぶ。 以後の一覧は新しいキーで引き直す。 */
    async invalidate(): Promise<void> {
      localGeneration += 1;
      inflight.clear();
      const store = resolveStore();
      if (!store) return;
      try {
        await withTimeout(store.incr(GENERATION_KEY), timeoutMs);
      } catch {
        // Redis の世代が進まなくても TTL で追いつく
      }
    },
  };
}

export type TaskListCache = ReturnType<typeof createTaskListCache>;
