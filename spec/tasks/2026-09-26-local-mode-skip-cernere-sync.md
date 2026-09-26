---
task: local-mode-skip-cernere-sync
project: At
kind: implementation
status: delegated
delegation_run_id: 3f12f4fc-857c-4689-8272-6c5815443c92
source_session: lictor-05c6f1e0-c715-45fa-8426-17141689c501
created: 2026-09-26
actio_task_id: ab3ce741-ea47-4229-8712-18285b73da65
memory_links:
  - ../feature/local-auth-mode.md
  - ../data/data-scheme.md
---

# ローカルモードでは起動時の Cernere schema sync を行わない

## 目的

ローカルモードの起動ごとに `Cernere schema sync failed: Cernere project credentials not configured`
が err.log に出ていた。`CERNERE_URL` だけ設定され project 資格情報が無い構成で
`updateProjectSchema` が throw していたため。ローカルモードには Cernere project が無いので同期しない。

仕様: `../feature/local-auth-mode.md` の Cernere schema sync 節 (SPEC-SCHEMA-SYNC-SKIP)。

## 方式

- 判定は純関数 `shouldSyncSchema` (`src/plugins/schema-sync-policy.ts`) に分ける。
  ローカルモード → info スキップ、`CERNERE_URL` 無し → info スキップ、
  公開配備で client id / secret 欠落 → warn スキップ (throw しない)、揃っていれば同期。
- `syncProjectSchemaToCernere` はこの判定だけを見て Cernere を呼ぶかを決める。
- 起動時の fire-and-forget 呼び出しには catch を付け、未処理の rejection を残さない。

## 契約観測ランタイム (SPEC-CONTRACT-RUNTIME)

Augur `contract-wrap` の import 先として `src/contract-runtime.ts` を置く。
包んだ関数の戻り値・例外は変えず、判定結果だけを `VESTIGIUM_LOGS_DIR` (無ければ `<cwd>/logs`)
の `contracts.jsonl` に書く。引数・戻り値の中身は記録しない。
注入される述語 import は `.ts` 拡張子付きなので、`tsconfig.json` の
`rewriteRelativeImportExtensions` で出力時に `.js` へ書き換える。

## 受け入れ条件

- C-1 shouldSyncSchema(input): ローカルモードでは同期せず info でスキップし、公開配備で CERNERE_URL があり client id / secret が欠けるときは throw せず warn でスキップし、URL・id・secret が揃った公開配備でだけ同期する

## 検証

- `tests/unit/schema-sync-policy.test.ts` — 判定表の全分岐
- `tests/unit/schema-sync.test.ts` — ローカルモード / 資格情報欠落で `updateProjectSchema` を呼ばないこと、揃えば呼ぶこと
