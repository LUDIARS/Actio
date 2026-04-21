/**
 * モジュールレジストリ (インメモリ)
 *
 * ロード済みモジュールの保持と enabled 状態のキャッシュ。
 * enable/disable は DB 反映後に `setEnabled` でキャッシュ更新。
 */

import type { ModuleDefinition } from "@ludiars/schedula-sdk";
import type { ScopeType } from "./repository.js";

/** Issue #111 S4/S5 — register 衝突などを区別できるよう名前付きエラー. */
export class ModuleRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModuleRegistryError";
  }
}

export interface LoadedModule {
  definition: ModuleDefinition;
  packageName: string;
  packageVersion: string;
}

export interface EnabledKey {
  moduleId: string;
  scopeType: ScopeType;
  scopeId: string | null;
}

class ModuleRegistry {
  private modules = new Map<string, LoadedModule>();
  /** キー形式: "moduleId:scopeType:scopeId" */
  private enabledCache = new Map<string, boolean>();

  register(mod: LoadedModule): void {
    // Issue #111 S4 — 重複登録を silent overwrite ではなく throw.
    // モジュールを動的に差し替えたい場合は事前に unregister() を呼ぶ.
    if (this.modules.has(mod.definition.id)) {
      throw new ModuleRegistryError(
        `Module "${mod.definition.id}" is already registered. ` +
        `Call unregister() first if you intend to replace it.`,
      );
    }
    this.modules.set(mod.definition.id, mod);
  }

  unregister(moduleId: string): void {
    this.modules.delete(moduleId);
    // 該当モジュールの enabled cache もクリア
    for (const key of this.enabledCache.keys()) {
      if (key.startsWith(`${moduleId}:`)) {
        this.enabledCache.delete(key);
      }
    }
  }

  get(moduleId: string): LoadedModule | undefined {
    return this.modules.get(moduleId);
  }

  list(): LoadedModule[] {
    return [...this.modules.values()];
  }

  has(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }

  // ─── enabled state cache ─────────────────────────────────

  private key(moduleId: string, scopeType: ScopeType, scopeId: string | null): string {
    return `${moduleId}:${scopeType}:${scopeId ?? ""}`;
  }

  /** cache 書き込み (DB 更新時に呼ぶ) */
  setEnabledCache(
    moduleId: string,
    scopeType: ScopeType,
    scopeId: string | null,
    enabled: boolean,
  ): void {
    this.enabledCache.set(this.key(moduleId, scopeType, scopeId), enabled);
  }

  getEnabledCache(
    moduleId: string,
    scopeType: ScopeType,
    scopeId: string | null,
  ): boolean | undefined {
    return this.enabledCache.get(this.key(moduleId, scopeType, scopeId));
  }

  clearEnabledCache(): void {
    this.enabledCache.clear();
  }
}

export const moduleRegistry = new ModuleRegistry();
