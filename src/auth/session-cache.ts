/**
 * セッションユーザーキャッシュ (プロセス内)
 *
 * 認証成功時にユーザー情報をプロセス内に TTL 付きで置き、
 * 以降のリクエストで Cernere への問い合わせを減らす。
 * 外部のキャッシュサービスには依存しない (2026-10-16 Redis 依存を廃止)。
 * プロセス再起動で消えるが、miss 時は Cernere から取り直すので結果は変わらない。
 */

const DEFAULT_TTL = 3600; // 1時間 (service_token の有効期限に合わせる)
const MAX_ENTRIES = 10_000;

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: string;
  [key: string]: unknown;
}

interface Entry {
  user: SessionUser;
  expiresAt: number;
}

// Map は挿入順を保つので、先頭が最も古い
const entries = new Map<string, Entry>();

export async function saveSessionUser(user: SessionUser, ttlSeconds = DEFAULT_TTL): Promise<void> {
  entries.delete(user.id);
  entries.set(user.id, { user, expiresAt: Date.now() + ttlSeconds * 1000 });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
}

export async function getSessionUser(userId: string): Promise<SessionUser | null> {
  const entry = entries.get(userId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    entries.delete(userId);
    return null;
  }
  return entry.user;
}

export async function invalidateSessionUser(userId: string): Promise<void> {
  entries.delete(userId);
}
