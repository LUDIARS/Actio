/**
 * モジュールローダー
 *
 * Phase 1: ソース内モジュール (packages/modules/* or modules/*) を静的登録。
 * 将来的に npm パッケージから動的 import する。
 *
 * ## Issue #111 — セキュリティ強化
 *
 * このローダーは下記のガードを入り口で実施する:
 *   - S4 / S5: moduleId 重複 / basePath 衝突 / 予約 prefix 使用を reject
 *   - S6: 3 階層スコープ (global / group / user) 対応 moduleGate
 *   - S9/D9: depends 未解決 / 循環 / schedulaApiVersion 非互換を起動時検出
 *   - S1: `wsCommands` 値が `WsCommandDefinition` で requireAuth / requireRole
 *         を指定できる (内部で `registerCommandEntry` に渡す)
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import type {
  ModuleDefinition,
  WsCommandEntry,
  WsCommandHandler,
} from "@ludiars/schedula-sdk";
import { moduleRegistry, ModuleRegistryError } from "./registry.js";
import {
  moduleInstallationRepo,
  moduleStateRepo,
} from "./repository.js";
import { buildModuleContext, buildModuleContextFromDef } from "./context.js";
import { registerCommandEntry } from "../ws/dispatcher.js";
import {
  HOST_SCHEDULA_API_VERSION,
  satisfiesSemverRange,
} from "./semver.js";
import { customFieldRegistry } from "./custom-fields.js";
import { workflowRegistry } from "./workflow.js";
import { composePluginTablesSQL } from "./tables.js";
import { db, dialect } from "../db/connection.js";
import { sql as drizzleSql } from "drizzle-orm";

// ── エラー / 予約 prefix ──────────────────────────────

export class ModuleLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleLoadError";
  }
}

/**
 * コア API が占有している basePath prefix. プラグインはこれらの
 * 配下に路を生やしてはいけない (S5).
 */
const RESERVED_BASE_PATHS: readonly string[] = [
  "/api/admin",
  "/api/auth",
  "/api/events",
  "/api/tasks",
  "/api/users",
  "/api/groups",
  "/api/me",
  "/api/health",
];

/** 既に登録済みの basePath を追跡. 並びは挿入順で不定だが set 比較のみ. */
const mountedBasePaths = new Set<string>();

function normaliseBasePath(p: string): string {
  // Hono は先頭 `/` 必須。末尾 `/` は許容しない方針 (衝突判定の安定性重視).
  let out = p.trim();
  if (!out.startsWith("/")) out = `/${out}`;
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function overlaps(a: string, b: string): boolean {
  // prefix 衝突: 完全一致 または 一方が他方の「親パス」になっている.
  if (a === b) return true;
  if (a.startsWith(`${b}/`)) return true;
  if (b.startsWith(`${a}/`)) return true;
  return false;
}

function assertBasePathAvailable(moduleId: string, raw: string): string {
  const normalized = normaliseBasePath(raw);
  for (const reserved of RESERVED_BASE_PATHS) {
    if (overlaps(normalized, reserved)) {
      throw new ModuleLoadError(
        `[plugin ${moduleId}] basePath "${raw}" collides with reserved prefix "${reserved}".`,
      );
    }
  }
  for (const taken of mountedBasePaths) {
    if (overlaps(normalized, taken)) {
      throw new ModuleLoadError(
        `[plugin ${moduleId}] basePath "${raw}" collides with already-mounted "${taken}".`,
      );
    }
  }
  mountedBasePaths.add(normalized);
  return normalized;
}

/** 単体テスト用. production で呼ばない. */
export function __resetLoaderStateForTest(): void {
  mountedBasePaths.clear();
}

export interface RegisterOptions {
  packageName: string;
  packageVersion: string;
}

// ── depends / schedulaApiVersion 検証 (S9 / D9) ─────────

function assertCompatibleApiVersion(def: ModuleDefinition): void {
  if (!def.schedulaApiVersion) {
    throw new ModuleLoadError(
      `[plugin ${def.id}] schedulaApiVersion is required.`,
    );
  }
  if (!satisfiesSemverRange(HOST_SCHEDULA_API_VERSION, def.schedulaApiVersion)) {
    throw new ModuleLoadError(
      `[plugin ${def.id}] schedulaApiVersion "${def.schedulaApiVersion}" ` +
      `does not accept host ${HOST_SCHEDULA_API_VERSION}.`,
    );
  }
}

function assertDependenciesSatisfied(def: ModuleDefinition): void {
  const deps = def.depends ?? [];
  for (const dep of deps) {
    if (dep === def.id) {
      throw new ModuleLoadError(
        `[plugin ${def.id}] self-dependency in depends[] is not allowed.`,
      );
    }
    if (!moduleRegistry.has(dep)) {
      throw new ModuleLoadError(
        `[plugin ${def.id}] missing required dependency "${dep}". ` +
        `Install the dependency module first (installModule order matters).`,
      );
    }
  }
  // 循環検出: この登録を加えた上で DFS で先祖→自身が見えないか.
  const visited = new Set<string>();
  const stack   = new Set<string>();
  function dfs(id: string): void {
    if (stack.has(id)) {
      throw new ModuleLoadError(
        `[plugin ${def.id}] circular dependency detected through "${id}".`,
      );
    }
    if (visited.has(id)) return;
    stack.add(id);
    const mod = id === def.id ? { definition: def } : moduleRegistry.get(id);
    const ds  = mod?.definition.depends ?? [];
    for (const d of ds) dfs(d);
    stack.delete(id);
    visited.add(id);
  }
  dfs(def.id);
}

// ── wsCommands の entry 正規化 (S1) ────────────────────

function normaliseWsEntry(raw: WsCommandEntry): {
  handler: WsCommandHandler;
  requireAuth: boolean;
  requireRole?: import("@ludiars/schedula-sdk").WsRequiredRole;
} {
  if (typeof raw === "function") {
    return { handler: raw, requireAuth: true };
  }
  return {
    handler:     raw.handler,
    requireAuth: raw.requireAuth !== false,
    requireRole: raw.requireRole,
  };
}

// ── installModule ──────────────────────────────────────

/**
 * モジュールをレジストリに登録する。
 *
 * 登録前に S5 (basePath 衝突) / S9 (depends + semver) を検証し、不正な
 * 構成は同期 throw する。ホスト側起動失敗で catch するのが想定動作.
 */
export function installModule(
  app: Hono,
  definition: ModuleDefinition,
  opts: RegisterOptions,
): void {
  // 1. semver + depends (S9 / D9) — 失敗時は即 throw
  assertCompatibleApiVersion(definition);
  assertDependenciesSatisfied(definition);

  const ctx = buildModuleContextFromDef(definition);

  // 3b. customFields / workflow レジストリ登録 (D1 / D2)
  if (definition.customFields) {
    for (const [fieldId, fdef] of Object.entries(definition.customFields)) {
      customFieldRegistry.register(definition.id, fieldId, fdef);
    }
  }
  if (definition.workflow) {
    workflowRegistry.register(definition.id, definition.workflow);
  }

  // 3c. plugin-owned tables の schema 合成 (D8).
  //    SQLite dialect のみ自動実行. 他 dialect では WARN + spec/plan-for-migration.
  if (definition.tables && Object.keys(definition.tables).length > 0) {
    if (dialect === "sqlite") {
      const composed = composePluginTablesSQL(definition);
      for (const { sql } of composed) {
        try {
          (db as { run: (stmt: ReturnType<typeof drizzleSql.raw>) => unknown })
            .run(drizzleSql.raw(sql));
        } catch (err) {
          console.warn(`[plugin ${definition.id}] table DDL failed: ${sql}`, err);
        }
      }
    } else {
      console.warn(
        `[plugin ${definition.id}] plugin-owned tables auto-migrate is SQLite-only in this milestone (current dialect: ${dialect}). ` +
        `Generate migrations via \`composePluginTablesSQL()\` and run them manually.`,
      );
    }
  }

  // 2. REST routes wire (S5: basePath 衝突検出 + 予約 prefix 拒否)
  if (definition.routes && definition.basePath) {
    const mountedPath = assertBasePathAvailable(definition.id, definition.basePath);
    const sub = new Hono();
    const factoryResult = definition.routes(sub, ctx);
    app.use(`${mountedPath}/*`, moduleGateForScope(definition));
    app.route(mountedPath, sub);
    if (factoryResult && typeof factoryResult === "object" && "catch" in factoryResult) {
      (factoryResult as Promise<void>).catch((err: unknown) =>
        console.error(`[plugin] ${definition.id} routes factory async error:`, err),
      );
    }
  }

  // 3. WS commands wire (S1: 宣言的 auth/role, S6: global 有効性チェック)
  if (definition.wsCommands) {
    for (const [action, entry] of Object.entries(definition.wsCommands)) {
      const norm = normaliseWsEntry(entry);
      registerCommandEntry(definition.id, action, {
        handler: async (userId, payload) => {
          const globalEnabled = await isEnabled(definition.id, "global", null);
          if (!globalEnabled) throw new Error(`Module ${definition.id} is disabled`);
          return norm.handler(userId, payload, ctx);
        },
        requireAuth: norm.requireAuth,
        requireRole: norm.requireRole,
      });
    }
  }

  // 4. registry 登録 (S4: 重複 throw)
  moduleRegistry.register({
    definition,
    packageName: opts.packageName,
    packageVersion: opts.packageVersion,
  });

  // 5. DB 記録 + lifecycle hooks は非同期後追い
  void (async () => {
    try {
      const wasInstalled = (await moduleInstallationRepo.findById(definition.id)) !== undefined;
      if (!wasInstalled && definition.onInstall) {
        await definition.onInstall(ctx);
      }
      await moduleInstallationRepo.upsert({
        id: uuidv4(),
        moduleId: definition.id,
        packageName: opts.packageName,
        packageVersion: opts.packageVersion,
        manifest: serializeManifest(definition),
        installedAt: new Date(),
        installedBy: null,
      });
      if (definition.onEnable) {
        await definition.onEnable(ctx, "global");
      }
    } catch (err) {
      console.error(`[plugin] ${definition.id} post-install failed:`, err);
    }
  })();
}

function serializeManifest(def: ModuleDefinition): Record<string, unknown> {
  return {
    id: def.id,
    name: def.name,
    description: def.description,
    version: def.version,
    schedulaApiVersion: def.schedulaApiVersion,
    depends: def.depends ?? [],
    scope: def.scope,
    basePath: def.basePath,
    tables: def.tables ? Object.keys(def.tables) : [],
    userData: def.userData ? Object.keys(def.userData) : [],
    wsCommands: def.wsCommands ? Object.keys(def.wsCommands) : [],
  };
}

/**
 * モジュールが指定スコープで有効かチェック (cache → DB → default true)
 */
export async function isEnabled(
  moduleId: string,
  scopeType: "global" | "group" | "user",
  scopeId: string | null,
): Promise<boolean> {
  // cache
  const cached = moduleRegistry.getEnabledCache(moduleId, scopeType, scopeId);
  if (cached !== undefined) return cached;

  // DB
  const state = await moduleStateRepo.findByScope(moduleId, scopeType, scopeId);
  const enabled = state ? state.enabled : true; // デフォルトは有効
  moduleRegistry.setEnabledCache(moduleId, scopeType, scopeId, enabled);
  return enabled;
}

/**
 * **Issue #111 S6** — 3 階層スコープ対応版 moduleGate.
 *
 * 以前は `global` スコープしか見ていなかったため、group/user スコープで
 * disable してあっても REST 経由で通ってしまっていた。本版では:
 *
 *   1. global が disabled なら即 503 (従来挙動)
 *   2. definition.scope === "per-group" のとき、リクエストから
 *      `:groupId` route param または `X-Group-Id` header を抽出し、
 *      その group スコープが disabled なら 503
 *   3. definition.scope === "per-user" のとき、認証済み userId に
 *      対する user スコープが disabled なら 503 (= opt-out を尊重)
 *
 * いずれも「明示的に disable された場合」のみ 503。未設定は既定 true.
 */
function extractGroupId(c: import("hono").Context): string | null {
  const param = c.req.param("groupId");
  if (typeof param === "string" && param.length > 0) return param;
  const header = c.req.header("x-group-id");
  if (typeof header === "string" && header.length > 0) return header;
  return null;
}

function extractUserId(c: import("hono").Context): string | null {
  const id = c.get("userId" as never) as string | undefined;
  if (!id || id === "anonymous") return null;
  return id;
}

export function moduleGateForScope(def: ModuleDefinition) {
  return async (c: import("hono").Context, next: () => Promise<void>) => {
    // (1) global
    if (!(await isEnabled(def.id, "global", null))) {
      return c.json({ error: `Module ${def.id} is disabled` }, 503);
    }

    // (2) per-group
    if (def.scope === "per-group") {
      const gid = extractGroupId(c);
      if (gid && !(await isEnabled(def.id, "group", gid))) {
        return c.json({ error: `Module ${def.id} is disabled for group ${gid}` }, 503);
      }
    }

    // (3) per-user
    if (def.scope === "per-user") {
      const uid = extractUserId(c);
      if (uid && !(await isEnabled(def.id, "user", uid))) {
        return c.json({ error: `Module ${def.id} is disabled for user` }, 503);
      }
    }

    await next();
  };
}

/** 旧シグネチャ互換. 呼び出し側 (admin-routes 等) は id 指定で global のみ判定. */
export function moduleGate(moduleId: string) {
  return async (c: import("hono").Context, next: () => Promise<void>) => {
    if (!(await isEnabled(moduleId, "global", null))) {
      return c.json({ error: `Module ${moduleId} is disabled` }, 503);
    }
    await next();
  };
}

/** enable/disable を更新し、cache も反映 */
export async function setModuleEnabled(
  moduleId: string,
  scopeType: "global" | "group" | "user",
  scopeId: string | null,
  enabled: boolean,
  changedBy?: string,
): Promise<void> {
  await moduleStateRepo.setEnabled(
    uuidv4(),
    moduleId,
    scopeType,
    scopeId,
    enabled,
    changedBy,
  );
  moduleRegistry.setEnabledCache(moduleId, scopeType, scopeId, enabled);

  // ライフサイクルフック
  const mod = moduleRegistry.get(moduleId);
  if (mod) {
    const ctx = buildModuleContextFromDef(mod.definition);
    if (enabled && mod.definition.onEnable) {
      await mod.definition.onEnable(ctx, `${scopeType}:${scopeId ?? "*"}`);
    }
    if (!enabled && mod.definition.onDisable) {
      await mod.definition.onDisable(ctx, `${scopeType}:${scopeId ?? "*"}`);
    }
  }
}

/**
 * モジュールをアンインストールする (Issue #111 D10).
 *
 *   1. `onUninstall` フック呼び出し
 *   2. レジストリから除去
 *   3. customFields / workflow / mountedBasePaths から除去
 *   4. WS ハンドラは dispatcher のレジストリに残るため解除不能
 *      (次回起動時にロードされなければ自然消滅 — 現状の制約を doc に明記)
 *   5. `module_installations` と `module_states` の DB 行は残置
 *      (監査/ロールバック目的). 完全削除は手動マイグレーションで.
 */
export async function uninstallModule(moduleId: string): Promise<void> {
  const mod = moduleRegistry.get(moduleId);
  if (!mod) return;
  const ctx = buildModuleContextFromDef(mod.definition);

  try { await mod.definition.onUninstall?.(ctx); }
  catch (err) { console.warn(`[plugin ${moduleId}] onUninstall threw:`, err); }

  moduleRegistry.unregister(moduleId);
  customFieldRegistry.unregister(moduleId);
  workflowRegistry.unregister(moduleId);
  releaseBasePath(mod.definition.basePath);
}

function releaseBasePath(raw?: string): void {
  if (!raw) return;
  let out = raw.trim();
  if (!out.startsWith("/")) out = `/${out}`;
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  mountedBasePaths.delete(out);
}

// ModuleRegistryError を loader 利用側からも import できるよう再エクスポート.
export { ModuleRegistryError };
