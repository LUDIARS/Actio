/**
 * Issue #111 D6 — frontend module federation loader (host side)
 *
 * Actio のフロントエンドが、プラグインが配布する `remoteEntry.js`
 * を **runtime に動的 import して UI をマウントする** ための薄い
 * ローダー. プラグインごとの UI は `default export` が
 * `{ mount(container) / unmount(container?) }` を備える想定.
 *
 * バックエンドは `GET /api/admin/modules/manifests` で登録済み module
 * の `remoteEntry` を返す. そこから dynamic import してマウントする.
 *
 * ## 制約 (Phase 1)
 * - Vite の module federation プラグインを使わない素の `import(url)`.
 *   ES Module として配信されていれば動く.
 * - 失敗は console.warn に留め、ホスト UI 全体を止めない.
 */

export interface PluginManifest {
  moduleId:    string;
  name:        string;
  description?: string;
  remoteEntry: string;
  basePath?:   string;
}

export interface PluginMountable {
  mount(container: HTMLElement, ctx?: { moduleId: string }): void | Promise<void>;
  unmount?(container: HTMLElement): void | Promise<void>;
}

export async function fetchPluginManifests(): Promise<PluginManifest[]> {
  const res = await fetch("/api/admin/modules/manifests", {
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });
  if (!res.ok) throw new Error(`failed to fetch manifests: HTTP ${res.status}`);
  const body = await res.json() as { manifests?: PluginManifest[] };
  return body.manifests ?? [];
}

/**
 * remoteEntry を dynamic import し `default` 等の export を `PluginMountable`
 * として返す. 解決できない場合は `null`.
 */
export async function loadPluginUi(manifest: PluginManifest): Promise<PluginMountable | null> {
  try {
    // Vite が静的解析しようとしないように `/* @vite-ignore */` を付ける.
    const mod = (await import(/* @vite-ignore */ manifest.remoteEntry)) as {
      default?: PluginMountable;
      plugin?:  PluginMountable;
    };
    return mod.plugin ?? mod.default ?? null;
  } catch (err) {
    console.warn(`[plugin-ui] failed to load ${manifest.moduleId} (${manifest.remoteEntry}):`, err);
    return null;
  }
}

/**
 * 最低限の lifecycle ヘルパ. 呼び出し元 (React 側ページ) は
 * `useEffect` 内で `mountAll(container)` → クリーンアップで `unmountAll()`
 * を呼ぶのが想定利用法.
 */
export async function mountAllPlugins(container: HTMLElement): Promise<Array<{ manifest: PluginManifest; ui: PluginMountable }>> {
  const manifests = await fetchPluginManifests();
  const out: Array<{ manifest: PluginManifest; ui: PluginMountable }> = [];
  for (const m of manifests) {
    const ui = await loadPluginUi(m);
    if (!ui) continue;
    try {
      const slot = document.createElement("div");
      slot.dataset.pluginId = m.moduleId;
      container.appendChild(slot);
      await ui.mount(slot, { moduleId: m.moduleId });
      out.push({ manifest: m, ui });
    } catch (err) {
      console.warn(`[plugin-ui] mount threw for ${m.moduleId}:`, err);
    }
  }
  return out;
}
