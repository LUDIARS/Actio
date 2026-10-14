/**
 * Cc から読んだ公開情報のメモリ内キャッシュ (spec/feature/public-issues.md §5)。
 * 保持は ttlMs まで。 期限を過ぎた値は返さず、 DB には保存しない。 失敗した読み取りは入れない。
 */
export interface TtlCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T): void;
  clear(): void;
}

export const PUBLIC_CACHE_TTL_MS = 60_000;

export function createTtlCache<T>(ttlMs: number, now: () => number = Date.now): TtlCache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(key) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      if (now() >= entry.expiresAt) {
        entries.delete(key);
        return undefined;
      }
      return entry.value;
    },
    set(key, value) {
      entries.set(key, { value, expiresAt: now() + ttlMs });
    },
    clear() {
      entries.clear();
    },
  };
}
