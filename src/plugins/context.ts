/**
 * ModuleContext の構築
 *
 * SDK の `ModuleContext` インターフェースを実装し、ホストの機能
 * (DB, Cernere, WS broadcast, secrets, audit, events, permissions) を
 * ブリッジする。
 *
 * Issue #111 で大きく拡張:
 *   - S3: `db.raw` を module-scoped Drizzle proxy に置換
 *   - S7: `userDataAs(callerId)` を追加 (caller-bound API)
 *   - S8: `oauth.store/delete` は必ず audit log を記録
 *   - D5: `modules.invoke` 実装 (depends 宣言のみ許可) + `events` 実装
 *   - D7: `permissions.requireSystemAdmin` / `requireGroupRole` を
 *         Hono middleware へブリッジ
 */

import type { MiddlewareHandler } from "hono";
import type {
  CallerScopedUserDataApi,
  DrizzleTableLike,
  EventBusApi,
  EventHandler,
  ModuleContext,
  ModuleDefinition,
  ModulesApi,
  OAuthApi,
  OAuthToken,
  OAuthTokenInput,
  PermissionsApi,
  UserDataApi,
  UserIdentity,
  UserIdentityApi,
} from "@ludiars/schedula-sdk";
import { db } from "../db/connection.js";
import { makeScopedDb } from "./db-scope.js";
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
import { pluginEventBus } from "./event-bus.js";
import {
  requireSystemAdminMiddleware,
  requireGroupRoleMiddleware,
} from "./permissions.js";

/** manifest の userData キーから Cernere のカラム名を合成 (module: prefix) */
function columnKey(moduleId: string, key: string): string {
  const snake = key.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase();
  return `${moduleId}:${snake}`;
}

/**
 * depends 宣言を受け取る形に変更. `modules.invoke` の call graph
 * 検証に使う (D5).
 */
export function buildModuleContext(
  moduleId: string,
  tables?: Record<string, DrizzleTableLike>,
  depends?: readonly string[],
): ModuleContext {
  // ─── users / getMany ───────────────────────────────────
  const users: UserIdentityApi = {
    async get(userId) {
      const info = await getUserInfo(userId);
      return info satisfies UserIdentity;
    },
    async getMany(userIds) {
      return getUserInfos(userIds);
    },
  };

  // ─── userData: caller-free (内部) + caller-bound (S7) ──
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

  function userDataAs(callerId: string): CallerScopedUserDataApi {
    if (!callerId || callerId === "anonymous") {
      throw new Error("[actio] userDataAs: callerId is required (non-anonymous).");
    }
    return {
      get: (key) => userData.get(callerId, key),
      set: (key, value) => userData.set(callerId, key, value),
      delete: (key) => userData.delete(callerId, key),
    };
  }

  // ─── oauth: 各操作を audit ログで必ず記録 (S8) ─────────
  async function auditOAuth(
    userId: string,
    action: string,
    detail: string,
  ): Promise<void> {
    try { logActivity(userId, "", `oauth:${moduleId}:${action}`, detail); }
    catch (err) { console.warn(`[oauth-audit] ${action} log failed:`, err); }
  }

  const oauth: OAuthApi = {
    async store(userId: string, input: OAuthTokenInput) {
      const r = await storeOAuthToken(userId, input);
      await auditOAuth(userId, "store", `provider=${input.provider}`);
      return r;
    },
    async get(userId: string, provider: string): Promise<OAuthToken | null> {
      // GET は通常トラフィックが多いので audit は軽量 (警告レベル抑制).
      return getOAuthToken(userId, provider);
    },
    async list(userId: string): Promise<OAuthToken[]> {
      return listOAuthTokens(userId);
    },
    async delete(userId: string, provider: string) {
      const r = await deleteOAuthToken(userId, provider);
      await auditOAuth(userId, "delete", `provider=${provider} deleted=${r.deleted}`);
      return r;
    },
  };

  // ─── ws ────────────────────────────────────────────────
  const ws = {
    async broadcastToGroup(groupId: string, event: string, payload: unknown, excludeUserId?: string) {
      const { broadcastToGroupMembers } = await import("../ws/broadcast.js");
      await broadcastToGroupMembers(groupId, event, payload as Record<string, unknown>, excludeUserId);
    },
    async relayToUser(_userId: string, _event: string, _payload: unknown) {
      // Phase 2: WS relay API は session-registry 経由
      throw new Error("[actio] ws.relayToUser() not implemented (Phase 2)");
    },
  };

  // ─── secrets (prefix 強制) ─────────────────────────────
  const secrets = {
    get(key: string): string | undefined {
      const full = `${moduleId.toUpperCase().replace(/-/g, "_")}_${key}`;
      return secretManager.getOrDefault(full, "") || undefined;
    },
    getOrDefault(key: string, fallback: string): string {
      const full = `${moduleId.toUpperCase().replace(/-/g, "_")}_${key}`;
      return secretManager.getOrDefault(full, fallback);
    },
  };

  // ─── modules.invoke (D5) ───────────────────────────────
  const declaredDeps = new Set<string>(depends ?? []);
  const modules: ModulesApi = {
    async invoke<T = unknown>(targetModuleId: string, command: string, payload: unknown): Promise<T> {
      if (targetModuleId === moduleId) {
        throw new Error(`[modules.invoke] cannot invoke self (${moduleId})`);
      }
      if (!declaredDeps.has(targetModuleId)) {
        throw new Error(
          `[modules.invoke] module "${moduleId}" did not declare dependency on "${targetModuleId}". ` +
          `Add it to depends[] in the manifest.`,
        );
      }
      // dispatcher 経由 (system_admin 権限で) 呼び出す. 呼び出し元は
      // プラグイン自体なので requireRole チェックを通す.
      const { dispatch } = await import("../ws/dispatcher.js");
      return (await dispatch(
        targetModuleId,
        command,
        { userId: `module:${moduleId}`, userRole: "system_admin" },
        payload,
      )) as T;
    },
  };

  // ─── event bus (D5) ───────────────────────────────────
  const events: EventBusApi = {
    async emit<P = unknown>(topic: string, payload: P): Promise<void> {
      await pluginEventBus.emit(topic, payload, moduleId);
    },
    subscribe<P = unknown>(topic: string, handler: EventHandler<P>): () => void {
      return pluginEventBus.subscribe(topic, moduleId, handler as EventHandler);
    },
  };

  // ─── permissions (D7) ─────────────────────────────────
  const permissions: PermissionsApi = {
    requireSystemAdmin() {
      return asErasedMiddleware(requireSystemAdminMiddleware());
    },
    requireGroupRole(role: "owner" | "leader" | "member") {
      return asErasedMiddleware(requireGroupRoleMiddleware(role));
    },
  };

  // ─── db (S3 module-scoped) ────────────────────────────
  const declaredTables = tables ? Object.values(tables) : [];
  const dbApi = {
    raw: declaredTables.length > 0
      ? makeScopedDb(db, moduleId, declaredTables)
      : db,   // 後方互換: tables 未宣言のモジュールは素通し
  };

  return {
    moduleId,
    users,
    userData,
    userDataAs,
    oauth,
    db: dbApi,
    ws,
    secrets,
    audit: (userId, action, detail) => logActivity(userId, "", action, detail),
    modules,
    events,
    permissions,
  };
}

/** SDK が要求する `(c: unknown, next) => Promise<unknown>` シグネチャへ
 *  Hono の `MiddlewareHandler` を流し込む. 実体はそのまま Hono 互換. */
function asErasedMiddleware(mw: MiddlewareHandler) {
  return mw as unknown as (c: unknown, next: () => Promise<unknown>) => Promise<unknown>;
}

/** loader から definition 全体を渡すヘルパ.
 *  (旧 installModule は `tables` だけ渡していたが、D5 のため `depends` も必要.) */
export function buildModuleContextFromDef(def: ModuleDefinition): ModuleContext {
  return buildModuleContext(def.id, def.tables, def.depends ?? []);
}
