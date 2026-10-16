/**
 * KVS ストレージエンジン
 *
 * ユーザーデータを KVS (Redis) に格納する。
 * Redis が無い場合はインメモリ Map をフォールバックに使用。
 *
 * キー設計:
 *   user:{id}                  → JSON (コアユーザーデータ)
 *   user:email:{email}         → userId (インデックス)
 *   user:google:{googleId}     → userId (インデックス)
 *   session:{id}               → JSON (セッションデータ)
 *   refresh:{refreshToken}     → sessionId (インデックス)
 *   profile:{serviceId}:{id}   → JSON (サービス固有プロフィール)
 *   id:user:count              → ユーザー数
 */

import type Redis from "ioredis";

// ─── Types ─────────────────────────────────────────────────

export interface KvsEngine {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  keys(pattern: string): Promise<string[]>;
  incr(key: string): Promise<number>;
  decr(key: string): Promise<number>;
}

// ─── Redis Implementation ──────────────────────────────────

export function createRedisKvs(redis: Redis): KvsEngine {
  return {
    async get(key) {
      return redis.get(key);
    },
    async set(key, value, ttlSeconds) {
      if (ttlSeconds) {
        await redis.set(key, value, "EX", ttlSeconds);
      } else {
        await redis.set(key, value);
      }
    },
    async del(key) {
      await redis.del(key);
    },
    async keys(pattern) {
      return redis.keys(pattern);
    },
    async incr(key) {
      return redis.incr(key);
    },
    async decr(key) {
      return redis.decr(key);
    },
  };
}

// ─── In-Memory Implementation (フォールバック) ─────────────

export function createMemoryKvs(): KvsEngine {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  function isExpired(entry: { expiresAt?: number }): boolean {
    if (!entry.expiresAt) return false;
    return Date.now() > entry.expiresAt;
  }

  return {
    async get(key) {
      const entry = store.get(key);
      if (!entry || isExpired(entry)) {
        if (entry) store.delete(key);
        return null;
      }
      return entry.value;
    },
    async set(key, value, ttlSeconds) {
      store.set(key, {
        value,
        expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined,
      });
    },
    async del(key) {
      store.delete(key);
    },
    async keys(pattern) {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      const result: string[] = [];
      for (const [k, entry] of store.entries()) {
        if (!isExpired(entry) && regex.test(k)) {
          result.push(k);
        }
      }
      return result;
    },
    async incr(key) {
      const entry = store.get(key);
      const current = entry && !isExpired(entry) ? parseInt(entry.value, 10) || 0 : 0;
      const next = current + 1;
      store.set(key, { value: String(next) });
      return next;
    },
    async decr(key) {
      const entry = store.get(key);
      const current = entry && !isExpired(entry) ? parseInt(entry.value, 10) || 0 : 0;
      const next = current - 1;
      store.set(key, { value: String(next) });
      return next;
    },
  };
}

// ─── User KVS Repository ──────────────────────────────────
// YAML スキーマのインデックス定義に基づいて KVS 操作を行う

export interface UserData {
  id: string;
  [key: string]: unknown;
}

export class UserKvsRepo {
  constructor(private kvs: KvsEngine) {}

  async findById(id: string): Promise<UserData | undefined> {
    const data = await this.kvs.get(`user:${id}`);
    return data ? JSON.parse(data) : undefined;
  }

  async findByEmail(email: string): Promise<UserData | undefined> {
    const id = await this.kvs.get(`user:email:${email}`);
    if (!id) return undefined;
    return this.findById(id);
  }

  async findByGoogleId(googleId: string): Promise<UserData | undefined> {
    const id = await this.kvs.get(`user:google:${googleId}`);
    if (!id) return undefined;
    return this.findById(id);
  }

  async countAll(): Promise<number> {
    const countStr = await this.kvs.get("id:user:count");
    return countStr ? parseInt(countStr, 10) : 0;
  }

  async create(data: UserData): Promise<void> {
    const id = data.id;
    await this.kvs.set(`user:${id}`, JSON.stringify(data));

    // インデックス更新
    if (data.email) await this.kvs.set(`user:email:${data.email as string}`, id);
    if (data.googleId) await this.kvs.set(`user:google:${data.googleId as string}`, id);

    await this.kvs.incr("id:user:count");
  }

  async update(id: string, updates: Record<string, unknown>): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) return;

    // インデックス更新 (変更があった場合)
    if (updates.email && updates.email !== existing.email) {
      if (existing.email) await this.kvs.del(`user:email:${existing.email as string}`);
      await this.kvs.set(`user:email:${updates.email as string}`, id);
    }
    if (updates.googleId && updates.googleId !== existing.googleId) {
      if (existing.googleId) await this.kvs.del(`user:google:${existing.googleId as string}`);
      await this.kvs.set(`user:google:${updates.googleId as string}`, id);
    }

    const merged = { ...existing, ...updates };
    await this.kvs.set(`user:${id}`, JSON.stringify(merged));
  }

  async delete(id: string): Promise<void> {
    const existing = await this.findById(id);
    if (!existing) return;

    if (existing.email) await this.kvs.del(`user:email:${existing.email as string}`);
    if (existing.googleId) await this.kvs.del(`user:google:${existing.googleId as string}`);
    await this.kvs.del(`user:${id}`);
    await this.kvs.decr("id:user:count");
  }

  /**
   * 全ユーザー取得 (keys scan)
   */
  async findAll(): Promise<UserData[]> {
    const keys = await this.kvs.keys("user:?*");
    // user:{uuid} のみ (インデックスキーを除外)
    const userKeys = keys.filter((k) => {
      const suffix = k.slice(5); // "user:" を除去
      return !suffix.includes(":"); // email: や google: を含まない
    });

    const users: UserData[] = [];
    for (const key of userKeys) {
      const data = await this.kvs.get(key);
      if (data) users.push(JSON.parse(data));
    }
    return users;
  }
}

// ─── Session KVS Repository ───────────────────────────────

export interface SessionData {
  id: string;
  userId: string;
  refreshToken: string;
  expiresAt: string;
  createdAt: string;
}

export class SessionKvsRepo {
  constructor(private kvs: KvsEngine) {}

  private ttlSeconds(expiresAt: string): number {
    const diffMs = new Date(expiresAt).getTime() - Date.now();
    return Math.max(Math.floor(diffMs / 1000), 60);
  }

  async create(data: SessionData): Promise<void> {
    const ttl = this.ttlSeconds(data.expiresAt);
    await this.kvs.set(`session:${data.id}`, JSON.stringify(data), ttl);
    await this.kvs.set(`refresh:${data.refreshToken}`, data.id, ttl);
  }

  async findByRefreshToken(refreshToken: string): Promise<SessionData | undefined> {
    const sessionId = await this.kvs.get(`refresh:${refreshToken}`);
    if (!sessionId) return undefined;
    const data = await this.kvs.get(`session:${sessionId}`);
    return data ? JSON.parse(data) : undefined;
  }

  async rotateRefreshToken(
    sessionId: string,
    oldToken: string,
    newToken: string,
    expiresAt: string,
  ): Promise<void> {
    const data = await this.kvs.get(`session:${sessionId}`);
    if (!data) return;
    const session = JSON.parse(data) as SessionData;
    session.refreshToken = newToken;
    session.expiresAt = expiresAt;
    const ttl = this.ttlSeconds(expiresAt);
    await this.kvs.set(`session:${sessionId}`, JSON.stringify(session), ttl);
    await this.kvs.del(`refresh:${oldToken}`);
    await this.kvs.set(`refresh:${newToken}`, sessionId, ttl);
  }

  async deleteByRefreshToken(refreshToken: string): Promise<void> {
    const sessionId = await this.kvs.get(`refresh:${refreshToken}`);
    if (sessionId) {
      await this.kvs.del(`session:${sessionId}`);
    }
    await this.kvs.del(`refresh:${refreshToken}`);
  }

  async deleteById(sessionId: string): Promise<void> {
    const data = await this.kvs.get(`session:${sessionId}`);
    if (data) {
      const session = JSON.parse(data) as SessionData;
      await this.kvs.del(`refresh:${session.refreshToken}`);
    }
    await this.kvs.del(`session:${sessionId}`);
  }
}

// ─── Profile KVS Repository ───────────────────────────────

export class ProfileKvsRepo {
  constructor(private kvs: KvsEngine) {}

  async get(serviceId: string, userId: string): Promise<Record<string, unknown> | undefined> {
    const data = await this.kvs.get(`profile:${serviceId}:${userId}`);
    return data ? JSON.parse(data) : undefined;
  }

  async set(serviceId: string, userId: string, profileData: Record<string, unknown>): Promise<void> {
    await this.kvs.set(`profile:${serviceId}:${userId}`, JSON.stringify(profileData));
  }

  async delete(serviceId: string, userId: string): Promise<void> {
    await this.kvs.del(`profile:${serviceId}:${userId}`);
  }

  async getAllForUser(userId: string): Promise<Record<string, Record<string, unknown>>> {
    const keys = await this.kvs.keys(`profile:*:${userId}`);
    const result: Record<string, Record<string, unknown>> = {};
    for (const key of keys) {
      const parts = key.split(":");
      const serviceId = parts[1];
      const data = await this.kvs.get(key);
      if (data) result[serviceId] = JSON.parse(data);
    }
    return result;
  }
}
