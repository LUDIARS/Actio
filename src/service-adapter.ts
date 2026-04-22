/**
 * Actio の peer service adapter 統合レイヤ.
 *
 * LUDIARS 内の他バックエンド (Imperativus, Nuntius, SchoolModules 等) が
 * Actio に直接 WS で到達できるよう、`@ludiars/cernere-service-adapter` の
 * `PeerAdapter` を初期化する. HTTP 経由の service-to-service 通信は
 * 行わない (CLAUDE.md の WS-only ルールに準拠).
 *
 * 起動:
 *   - Actio 起動時に `initServiceAdapter()` を呼ぶ
 *   - 必要な env が揃っていない場合は no-op (開発中・test などで無効化可)
 *
 * 受信コマンド:
 *   - `ping` — 疎通確認. caller.projectKey を echoして 200 を返す
 *   - 追加コマンドは plugin-actio-imperativus 等から register する
 *     (現状は本ファイルで直接 handle するが、将来 plugin 初期化で注入予定)
 */

import { PeerAdapter, type PeerHandler } from "@ludiars/cernere-service-adapter";
import { secretManager } from "./config/secrets.js";

let adapter: PeerAdapter | null = null;

export interface ActioServiceAdapterConfig {
  /** 未指定なら env から. */
  projectId?:      string;
  projectSecret?:  string;
  cernereBaseUrl?: string;
  /** 未指定なら `ws://0.0.0.0:{port}` (= 動的ポート, same-host). */
  saPublicBaseUrl?: string;
  /** 追加 handler (testing などで事前注入). */
  extraHandlers?:  Record<string, PeerHandler>;
}

/** ほかの LUDIARS バックエンドと話すための peer adapter を起動. */
export async function initServiceAdapter(
  cfg: ActioServiceAdapterConfig = {},
): Promise<PeerAdapter | null> {
  const projectId =
    cfg.projectId     ?? secretManager.getOrDefault("CERNERE_PROJECT_ID", "");
  const projectSecret =
    cfg.projectSecret ?? secretManager.getOrDefault("CERNERE_PROJECT_SECRET", "");
  const cernereBaseUrl =
    cfg.cernereBaseUrl ?? secretManager.getOrDefault("CERNERE_URL", "");

  if (!projectId || !projectSecret || !cernereBaseUrl) {
    console.log("[actio-sa] CERNERE_PROJECT_ID/SECRET/URL が未設定 — peer adapter は起動しません (user-facing API は影響なし)");
    return null;
  }

  const saPublicBaseUrl =
    cfg.saPublicBaseUrl ?? secretManager.getOrDefault("ACTIO_SA_PUBLIC_BASE_URL", "ws://127.0.0.1:{port}");

  adapter = new PeerAdapter({
    projectId, projectSecret, cernereBaseUrl, saPublicBaseUrl,
    saListenHost: "0.0.0.0",
    saListenPort: 0,
    accept: {
      // MVP: LUDIARS サービスからの ping のみ許可. コマンド追加は別 PR で.
      imperativus: ["ping"],
      nuntius:     ["ping"],
    },
  });

  // 既定 ping handler — caller の projectKey を echo するだけ
  adapter.handle("ping", async (caller, payload) => {
    return { ok: true, from: caller.projectKey, echo: payload };
  });
  // test などで事前注入された handler を上書き
  for (const [cmd, h] of Object.entries(cfg.extraHandlers ?? {})) {
    adapter.handle(cmd, h);
  }

  await adapter.start();
  console.log(`[actio-sa] peer adapter started (port ${adapter.boundListenPort})`);
  return adapter;
}

/** production からは通常呼ばない. test の teardown 用. */
export async function shutdownServiceAdapter(): Promise<void> {
  if (adapter) {
    await adapter.stop();
    adapter = null;
  }
}

export function currentServiceAdapter(): PeerAdapter | null {
  return adapter;
}
