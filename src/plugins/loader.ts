/**
 * モジュールローダー
 *
 * Phase 1: ソース内モジュール (packages/modules/* or modules/*) を静的登録。
 * 将来的に npm パッケージから動的 import する。
 */

import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import type { ModuleDefinition } from "@ludiars/schedula-sdk";
import { moduleRegistry, type LoadedModule } from "./registry.js";
import {
  moduleInstallationRepo,
  moduleStateRepo,
} from "./repository.js";
import { buildModuleContext } from "./context.js";
import { registerCommand } from "../ws/dispatcher.js";

export interface RegisterOptions {
  packageName: string;
  packageVersion: string;
}

/**
 * モジュールをレジストリに登録する。
 *
 * 実装方針: テスト/起動時の race condition を避けるため、REST 経路と
 * WS commands の登録は **同期**で行う。DB への installation 記録や
 * onInstall/onEnable フックは非同期 (fire-and-forget) で後追い実行する。
 *
 * ※ routes factory が async の場合は先に同期 Hono() を用意して
 *    呼び出すため、factory 内部が await する場合でも route mount 自体は同期。
 *    ただし factory 内の await 直前に定義された route しか同期で登録
 *    されないため、モジュール作者は factory の最初に全 route を登録する
 *    (SDK の convention)。
 */
export function installModule(
  app: Hono,
  definition: ModuleDefinition,
  opts: RegisterOptions,
): void {
  const ctx = buildModuleContext(definition.id);

  // REST routes wire (gate middleware 付き) — 同期
  if (definition.routes && definition.basePath) {
    const sub = new Hono();
    // factory を呼ぶ。async factory でも route 登録は同期的なので
    // await せず進めても route mount は成立する。戻り値の Promise は
    // 後処理のためにチェーンする。
    const factoryResult = definition.routes(sub, ctx);
    app.use(`${definition.basePath}/*`, moduleGate(definition.id));
    app.route(definition.basePath, sub);
    if (factoryResult && typeof factoryResult === "object" && "catch" in factoryResult) {
      (factoryResult as Promise<void>).catch((err: unknown) =>
        console.error(`[plugin] ${definition.id} routes factory async error:`, err),
      );
    }
  }

  // WS commands wire — 同期
  if (definition.wsCommands) {
    for (const [action, handler] of Object.entries(definition.wsCommands)) {
      registerCommand(definition.id, action, async (userId, payload) => {
        const globalEnabled = await isEnabled(definition.id, "global", null);
        if (!globalEnabled) throw new Error(`Module ${definition.id} is disabled`);
        return handler(userId, payload, ctx);
      });
    }
  }

  moduleRegistry.register({
    definition,
    packageName: opts.packageName,
    packageVersion: opts.packageVersion,
  });

  // DB 記録 + lifecycle hooks は非同期後追い
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

/** REST ミドルウェア: module 無効時に 503 を返す */
export function moduleGate(moduleId: string) {
  return async (c: import("hono").Context, next: () => Promise<void>) => {
    const enabled = await isEnabled(moduleId, "global", null);
    if (!enabled) {
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
    const ctx = buildModuleContext(moduleId);
    if (enabled && mod.definition.onEnable) {
      await mod.definition.onEnable(ctx, `${scopeType}:${scopeId ?? "*"}`);
    }
    if (!enabled && mod.definition.onDisable) {
      await mod.definition.onDisable(ctx, `${scopeType}:${scopeId ?? "*"}`);
    }
  }
}
