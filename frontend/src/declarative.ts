// Actio 宣言的 UI ブートストラップ — corpus-renderer + taskPanel descriptor で
// 既存 React UI とは別ページ /declarative.html を描く。
//
// Corpus DESIGN.md §13.8 step 4 (Bibliotheca / Actio を declarative panel 化、
// 自前 SPA 撤去) の段階的着手。 Actio frontend は React 19 + Vite (multi-entry)
// 構成のため、 main.tsx (既存 React 全面 UI) は無改変で共存する。
//
// 取込スコープ (declarative で完結する範囲):
//   - 新規タスクフォーム (タイトル / 詳細 / 優先度 / 期限)
//   - タスク一覧 + インライン編集 (title / description / status / priority / deadline) + 削除
// 取込外 (`custom` 領域 or 既存 React に残す):
//   - カレンダー / グループ / PM / smart-scheduler 等の全モジュール UI
//
// 既存 React UI は無改変で共存する (置き換えではなく追加)。
//
// 認証: Actio は HttpOnly cookie session (api.ts の credentials:'include' 同様)。
// localStorage Bearer は使わない。

import { renderPanel } from './corpus-renderer/renderer.ts';
import type {
  PanelDescriptor,
  RenderContext,
} from './corpus-renderer/types.ts';

// ── manifest 型 (Actio src/corpus.ts と同じ構造の最小サブセット) ──────────────

interface ManifestDataEndpoint {
  id: string;
  path: string;
  scope: 'local' | 'multi';
  title?: string;
}

interface DeclarativePanel {
  id: string;
  kind: 'declarative';
  title: string;
  ui: PanelDescriptor;
}

interface CorpusServiceManifest {
  service: string;
  displayName: string;
  corpusApi: number;
  data: ManifestDataEndpoint[];
  panels: DeclarativePanel[];
}

interface MeResponse {
  id?: string;
  userId?: string;
  name?: string;
  displayName?: string | null;
  isAdmin?: boolean;
  role?: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────

const $ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement;

// data() 実装 — manifest の dataId → endpoint path に解決して Actio 直叩き。
// path の :param は params から埋め、 残りは ?query にする。
function makeDataFn(manifest: CorpusServiceManifest): RenderContext['data'] {
  const byId = new Map(manifest.data.map((d) => [d.id, d]));

  return async function data(dataId, opts) {
    const endpoint = byId.get(dataId);
    if (!endpoint) {
      throw new Error(`unknown dataId: ${dataId}`);
    }
    let path = endpoint.path;
    const remaining: Record<string, string> = { ...(opts?.params || {}) };
    for (const key of Object.keys(remaining)) {
      const tag = `:${key}`;
      const val = remaining[key];
      if (val != null && path.includes(tag)) {
        path = path.replace(tag, encodeURIComponent(val));
        delete remaining[key];
      }
    }
    if (Object.keys(remaining).length) {
      const q = new URLSearchParams(remaining).toString();
      path += (path.includes('?') ? '&' : '?') + q;
    }

    const init: RequestInit = {
      method: opts?.method || 'GET',
      headers: {
        accept: 'application/json',
        ...(opts?.body != null
            ? { 'content-type': 'application/json' }
            : {}),
      },
      // Actio は HttpOnly cookie session。 src/lib/api.ts と同じ。
      credentials: 'include',
    };
    if (opts?.body != null) {
      init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    }
    return fetch(path, init);
  };
}

// ── bootstrap ───────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  try {
    // identity: Actio の既存 /api/auth/me を使う (Cernere SSO 後に cookie で取れる)。
    const meRes = await fetch('/api/auth/me', { credentials: 'include' });
    if (!meRes.ok) {
      $('#root').innerHTML =
        '<p class="hint">サインインしてください — <a href="/">通常 UI</a> から Cernere でログイン</p>';
      return;
    }
    const me: MeResponse = await meRes.json();
    const userId       = me.userId ?? me.id ?? 'unknown';
    const displayName  = me.displayName ?? me.name ?? null;
    const isAdmin      = me.isAdmin ?? (me.role === 'admin');

    const manifestRes = await fetch('/.well-known/corpus-service.json');
    if (!manifestRes.ok) {
      $('#root').innerHTML = '<p class="hint err">corpus-service.json が取得できません</p>';
      return;
    }
    const manifest: CorpusServiceManifest = await manifestRes.json();

    if (!manifest.panels?.length) {
      $('#root').textContent = 'declarative panel が未定義です。';
      return;
    }
    const panel = manifest.panels[0];
    if (!panel) {
      $('#root').textContent = 'declarative panel が未定義です。';
      return;
    }

    const ctx: RenderContext = {
      identity: { userId, displayName, isAdmin },
      data: makeDataFn(manifest),
    };

    const root = $('#root');
    root.innerHTML = '';
    renderPanel(root, panel.ui, ctx);

    const headerTitle = document.getElementById('header-title');
    if (headerTitle) headerTitle.textContent = panel.title;
  } catch (e) {
    const msg = (e as Error).message || String(e);
    $('#root').innerHTML = `<p class="hint err">init 失敗: ${msg}</p>`;
  }
}

void main();
