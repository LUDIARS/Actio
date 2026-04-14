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
  DbApi,
  WsApi,
  SecretsApi,
  ModulesApi,
  PermissionsApi,
} from "@ludiars/schedula-sdk";
import { db } from "../db/connection.js";
import { getUserInfo, getUserInfos } from "../auth/user-info.js";
import { secretManager } from "../config/secrets.js";
import { logActivity } from "../activity-logger.js";

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

  // Phase 1: userData は Cernere に project_schema API がまだ無いため
  // プレースホルダ実装。Phase 2 で Cernere 側 API を追加後に本実装。
  const userData: UserDataApi = {
    async get() {
      return null;
    },
    async set() {
      throw new Error(
        "[schedula] userData.set() not implemented yet (Phase 2: pending Cernere API)",
      );
    },
    async delete() {
      throw new Error(
        "[schedula] userData.delete() not implemented yet (Phase 2)",
      );
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
    db: dbApi,
    ws,
    secrets,
    audit: (userId, action, detail) => logActivity(userId, "", action, detail),
    modules,
    permissions,
  };
}
