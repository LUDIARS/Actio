/**
 * シンプルなインメモリレート制限ミドルウェア
 *
 * IP アドレスベースの固定ウィンドウ方式。
 * 認証エンドポイント等のブルートフォース対策に使用。
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

interface RateLimitOptions {
  /** ウィンドウあたりの最大リクエスト数 */
  maxRequests: number;
  /** ウィンドウの長さ (ミリ秒) */
  windowMs: number;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

// 古いエントリを定期的にクリーンアップ (5分ごと)
// 古いエントリを定期的にクリーンアップ (5分ごと)
setInterval(() => {
  const now = Date.now();
  for (const store of stores.values()) {
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  }
}, 5 * 60 * 1000);

function getClientIp(headers: { get: (name: string) => string | null }): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

/**
 * レート制限ミドルウェアを作成する
 *
 * Hono の MiddlewareHandler 互換の関数を返す。
 */
export function rateLimit(options: RateLimitOptions) {
  const storeKey = `${options.maxRequests}-${options.windowMs}`;
  if (!stores.has(storeKey)) {
    stores.set(storeKey, new Map());
  }
  const store = stores.get(storeKey)!;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (c: { req: { raw: Request }; header: (name: string, value: string) => void; json: (body: unknown, status: number) => Response }, next: () => Promise<void>) => {
    const ip = getClientIp(c.req.raw.headers);
    const now = Date.now();

    const entry = store.get(ip);

    if (!entry || entry.resetAt <= now) {
      store.set(ip, { count: 1, resetAt: now + options.windowMs });
      c.header("X-RateLimit-Limit", String(options.maxRequests));
      c.header("X-RateLimit-Remaining", String(options.maxRequests - 1));
      await next();
      return;
    }

    entry.count++;

    if (entry.count > options.maxRequests) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      c.header("Retry-After", String(retryAfterSec));
      c.header("X-RateLimit-Limit", String(options.maxRequests));
      c.header("X-RateLimit-Remaining", "0");
      return c.json(
        { error: "Too many requests. Please try again later." },
        429,
      );
    }

    c.header("X-RateLimit-Limit", String(options.maxRequests));
    c.header("X-RateLimit-Remaining", String(options.maxRequests - entry.count));
    await next();
  };
}
