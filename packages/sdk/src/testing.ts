/**
 * @ludiars/schedula-sdk/testing
 *
 * モジュール単体テスト用のモックホスト。
 */

import type {
  ModuleContext,
  UserIdentity,
  UserIdentityApi,
  UserDataApi,
  DbApi,
  WsApi,
  SecretsApi,
  ModulesApi,
  PermissionsApi,
} from "./types.js";

export interface MockContextOptions {
  moduleId?: string;
  users?: Record<string, Partial<UserIdentity>>;
  userData?: Record<string, Record<string, unknown>>;
  secrets?: Record<string, string>;
  db?: unknown;
}

/** テスト用に最小構成の ModuleContext を生成 */
export function createMockContext(opts: MockContextOptions = {}): ModuleContext {
  const moduleId = opts.moduleId ?? "test-module";
  const userMap = new Map<string, UserIdentity>(
    Object.entries(opts.users ?? {}).map(([id, u]) => [
      id,
      {
        id,
        name: u.name ?? `user-${id.slice(0, 8)}`,
        email: u.email ?? `${id}@unknown.local`,
        role: u.role ?? "general",
      },
    ]),
  );

  const users: UserIdentityApi = {
    async get(userId) {
      return (
        userMap.get(userId) ?? {
          id: userId,
          name: `user-${userId.slice(0, 8)}`,
          email: `${userId}@unknown.local`,
          role: "general",
        }
      );
    },
    async getMany(userIds) {
      const map = new Map<string, UserIdentity>();
      for (const id of userIds) map.set(id, await this.get(id));
      return map;
    },
  };

  const userDataStore = new Map<string, Map<string, unknown>>();
  for (const [uid, data] of Object.entries(opts.userData ?? {})) {
    userDataStore.set(uid, new Map(Object.entries(data)));
  }
  const userData: UserDataApi = {
    async get<T>(userId: string, key: string) {
      return (userDataStore.get(userId)?.get(key) as T | undefined) ?? null;
    },
    async set(userId, key, value) {
      if (!userDataStore.has(userId)) userDataStore.set(userId, new Map());
      userDataStore.get(userId)!.set(key, value);
    },
    async delete(userId, key) {
      userDataStore.get(userId)?.delete(key);
    },
  };

  const ws: WsApi = {
    async broadcastToGroup() {
      /* no-op */
    },
    async relayToUser() {
      /* no-op */
    },
  };

  const secrets: SecretsApi = {
    get: (k) => opts.secrets?.[k],
    getOrDefault: (k, fallback) => opts.secrets?.[k] ?? fallback,
  };

  const modules: ModulesApi = {
    async invoke() {
      throw new Error("[mock] cross-module invoke not implemented");
    },
  };

  const permissions: PermissionsApi = {
    requireSystemAdmin: () => async (_c, next) => next(),
    requireGroupRole: () => async (_c, next) => next(),
  };

  const db: DbApi = { raw: opts.db };

  return {
    moduleId,
    users,
    userData,
    db,
    ws,
    secrets,
    audit: () => {
      /* no-op */
    },
    modules,
    permissions,
  };
}
