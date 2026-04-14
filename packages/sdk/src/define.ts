/**
 * `defineModule()` — モジュール宣言ヘルパー
 *
 * manifest と実装を統合し、ホスト (Schedula 本体) が読み込める形の
 * `ModuleDefinition` を返す。型推論を強化するためのラッパ。
 */

import type { ModuleDefinition } from "./types.js";

export function defineModule<T extends ModuleDefinition>(mod: T): T {
  // 最低限の検証 (詳細は host 側の loader で実施)
  if (!mod.id || !/^[a-z][a-z0-9-]*$/.test(mod.id)) {
    throw new Error(
      `[schedula-sdk] invalid module id: "${mod.id}". ` +
        "Must match /^[a-z][a-z0-9-]*$/",
    );
  }
  if (!mod.schedulaApiVersion) {
    throw new Error(
      `[schedula-sdk] module "${mod.id}" must declare schedulaApiVersion`,
    );
  }
  if (!["global", "per-group", "per-user"].includes(mod.scope)) {
    throw new Error(
      `[schedula-sdk] module "${mod.id}" has invalid scope: "${mod.scope}"`,
    );
  }
  return mod;
}
