/**
 * ModuleContext の構築
 *
 * SDK の `ModuleContext` インターフェースを実装し、ホストの機能
 * (DB, Cernere, WS broadcast, secrets, audit ログ) をブリッジする。
 */

import type {
  ModuleContext,
  UserIdentity,
  UserIdentityApi,
  UserDataApi,
  OAuthApi,
  DbApi,
  WsApi,
  SecretsApi,
  ModulesApi,
  PermissionsApi,
} from "@ludiars/schedula-sdk";
import { db } from "../db/connection.js";
import { getUserInfo, getUserInfos } from "../auth/user-info.js";
import {
  getProjectUserColumns,
  setProjectUserData,
  deleteProjectUserColumns,
  storeOAuthToken,
  getOAuthToken,
  listOAuthTokens,
  deleteOAuthToken,
} from "../auth/cernere-client.js";
import { secretManager } from "../config/secrets.js";
import { logActivity } from "../activity-logger.js";

/** manifest の userData キーから Cernere のカラム名を合成 (module: prefix) */
function columnKey(moduleId: string, key: string): string {
  // SDK 側の defineModule() で lowerCamel の key を使うが Cernere は snake_case 前提。
  const snake = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return `${moduleId}:${snake}`;
}

export function buildModuleContext(moduleId: string): ModuleContext {
  const users: UserIdentityApi = {
    async get(userId) {
      const info = await getUserInfo(userId);
      return info satisfies UserIdentity;
    },
    async getMany(userIds) {
      return getUserInfos(userIds);
    },
  };

  // userData: Cernere project_data_{schedula} を proxy する。
  // カラム名は `${moduleId}:${snake_case(key)}` 形式で衝突回避。
  const userData: UserDataApi = {
    async get<T = unknown>(userId: string, key: string): Promise<T | null> {
      const col = columnKey(moduleId, key);
      const cols = await getProjectUserColumns(userId, [col]);
      return (cols[col] as T | undefined) ?? null;
    },
    async set(userId, key, value) {
      const col = columnKey(moduleId, key);
      await setProjectUserData(userId, { [col]: value });
    },
    async delete(userId, key) {
      const col = columnKey(moduleId, key);
      await deleteProjectUserColumns(userId, [col]);
    },
  };

  const oauth: OAuthApi = {
    async store(userId, input) {
      return storeOAuthToken(userId, input);
    },
    async get(userId, provider) {
      return getOAuthToken(userId, provider);
    },
    async list(userId) {
      return listOAuthTokens(userId);
    },
    async delete(userId, provider) {
      return deleteOAuthToken(userId, provider);
    },
  };

  const ws: WsApi = {
    async broadcastToGroup(groupId, event, payload, excludeUserId) {
      const { broadcastToGroupMembers } = await import("../ws/broadcast.js");
      await broadcastToGroupMembers(groupId, event, payload as Record<string, unknown>, excludeUserId);
    },
    async relayToUser(_userId, _event, _payload) {
      // Phase 2: WS relay API は session-registry 経由
      throw new Error("[schedula] ws.relayToUser() not implemented (Phase 2)");
    },
  };

  /** シークレットキーにモジュールID prefix を強制 (衝突回避) */
  const secrets: SecretsApi = {
    get(key) {
      const full = `${moduleId.toUpperCase().replace(/-/g, "_")}_${key}`;
      return secretManager.getOrDefault(full, "") || undefined;
    },
    getOrDefault(key, fallback) {
      const full = `${moduleId.toUpperCase().replace(/-/g, "_")}_${key}`;
      return secretManager.getOrDefault(full, fallback);
    },
  };

  const modules: ModulesApi = {
    async invoke() {
      // Phase 2: dispatcher 統合後に本実装
      throw new Error("[schedula] modules.invoke() not implemented (Phase 2)");
    },
  };

  const permissions: PermissionsApi = {
    requireSystemAdmin() {
      return async () => {
        throw new Error("[schedula] permissions.requireSystemAdmin() — use Hono middleware directly");
      };
    },
    requireGroupRole() {
      return async () => {
        throw new Error("[schedula] permissions.requireGroupRole() — use group-role middleware directly");
      };
    },
  };

  const dbApi: DbApi = { raw: db };

  return {
    moduleId,
    users,
    userData,
    oauth,
    db: dbApi,
    ws,
    secrets,
    audit: (userId, action, detail) => logActivity(userId, "", action, detail),
    modules,
    permissions,
  };
}
