/**
 * Issue #111 D10 — 外部 npm パッケージからモジュールを動的ロードする
 * ためのスケルトン.
 *
 * 現状の運用 (Phase 1) は `src/app.ts` での静的 `installModule()` 呼び出し
 * だが、将来的に `npm install @ludiars/plugin-foo` → 再起動不要で
 * ロードするには下記の流れが要る:
 *
 *   1. 管理 API で package spec (`name@version`) を受け取る
 *   2. 本番ノードで `npm install` 相当のインストール (実装は別レイヤ)
 *   3. `require.resolve` の結果 or 新 path から `await import(...)` する
 *   4. 返された `ModuleDefinition` を `installModule()` に渡す
 *
 * 現時点のスケルトンは (3) のみを担い、package specifier をそのまま
 * dynamic import するだけ. Node の ESM resolver に乗るなら動く.
 * 失敗時は throw. 管理 API ハンドラ側で 500 へ写像する.
 */

import { Hono } from "hono";
import type { ModuleDefinition } from "@ludiars/schedula-sdk";
import { installModule, ModuleLoadError } from "./loader.js";

export interface DynamicInstallRequest {
  /** `@scope/name` / `@scope/name@version` 形式のパッケージ指定. */
  packageName:    string;
  packageVersion: string;
}

export class DynamicLoadError extends Error {
  constructor(message: string) { super(message); this.name = "DynamicLoadError"; }
}

export async function loadPackageAsModule(
  req: DynamicInstallRequest,
): Promise<ModuleDefinition> {
  const specifier = req.packageName;
  let mod: { default?: ModuleDefinition; moduleDefinition?: ModuleDefinition };
  try {
    mod = await import(/* @vite-ignore */ specifier);
  } catch (err) {
    throw new DynamicLoadError(
      `failed to dynamic-import "${specifier}": ${(err as Error).message}. ` +
      `Ensure the package is installed and exports a ModuleDefinition as default.`,
    );
  }
  const def = mod.moduleDefinition ?? mod.default;
  if (!def) throw new DynamicLoadError(`${specifier}: no default / moduleDefinition export`);
  if (!def.id || !def.schedulaApiVersion) {
    throw new DynamicLoadError(`${specifier}: exported object is not a valid ModuleDefinition`);
  }
  return def;
}

/**
 * Hono ルーター. `/api/admin/modules/install-package` に admin 認証で
 * マウントする想定. エラーハンドリングは呼び出し側の requireAdmin で補う.
 */
export function dynamicInstallRoutes(app: import("hono").Hono): void {
  const sub = new Hono();
  sub.post("/", async (c) => {
    const body = await c.req.json().catch(() => null) as DynamicInstallRequest | null;
    if (!body || !body.packageName || !body.packageVersion) {
      return c.json({ error: "body must contain packageName and packageVersion" }, 400);
    }
    let def: ModuleDefinition;
    try { def = await loadPackageAsModule(body); }
    catch (err) { return c.json({ error: (err as Error).message }, 500); }

    try {
      installModule(app, def, { packageName: body.packageName, packageVersion: body.packageVersion });
    } catch (err) {
      if (err instanceof ModuleLoadError) return c.json({ error: err.message }, 400);
      return c.json({ error: (err as Error).message }, 500);
    }
    return c.json({ ok: true, moduleId: def.id });
  });
  app.route("/api/admin/modules/install-package", sub);
}
