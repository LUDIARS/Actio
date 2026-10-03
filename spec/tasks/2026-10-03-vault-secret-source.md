---
project: Actio
kind: task
created: 2026-10-03
reference: actio:84561cba-3297-419e-83e2-f995028e4dab
---

# Vault secret-agent 応答への対応

## 実装内容

- [x] 契約 C-2/C-3 と述語を実装前に定義する。
- [x] Vault応答のsource・要求キー部分集合・値型を検証し、403を分類する。
- [x] 取得設定と初回UIをキー指定だけに変更する。
- [x] Infisical直接クライアント・旧マッピング登録・更新APIを撤去する。
- [x] 回帰テストと仕様を更新し、Tirociniumを読み取り調査する。
- 提出結果（Concordiaコミット依頼・Revisor local PR）は委託statusに記録する。

## 受け入れ条件

C-2 resolveSecretsFromExcubitor(source): Vault の要求キー部分集合だけをメモリへ返す
C-3 parseSecretSource(keys): キー指定だけを受理しローカル設定を拒否する

## 再利用とテスト計画

既存のexcubitorFetch/token解決、secret-source検証、SecretManagerのキャッシュ、暗号化configとsetup検証を採用する。旧Infisicalクライアントとマッピング登録はVault契約に不要なため撤去する。新たなprovider抽象層は追加しない。
augur planの提案（既存挙動をunitで固定）を、Vault部分応答・source違反・403/404/502・不正応答・ローカルキー拒否・setup正規化・キャッシュ優先順位の回帰ケースへ具体化した。本文指定によりテストとサービスは実行しない。契約の未観測を成功として扱わない。

## 互換性調査

Tirocinium packages/secrets/src/client.ts の parseResolveResponse はsecretsだけを読むためsource=vaultとnullのproject_id/environmentに互換。403はfetch_failed、404はno_mapping、502はfetch_failedに分類する。403の専用分類はない。Tirociniumの変更・実行はしていない。

## 制約

旧暗号化configのproject/environment項目は読めるように保持するが利用しない。実データ移行、Excubitor側変更、サービス操作、mergeは範囲外。
問題ログのmainへの作成は作業対象worktree限定の指示に反するため行わず、原因（旧project/environment照合とVault null応答の不整合）をこの作業記録に残す。

## 静的検証

Augur契約lintとTypeScript/TSX構文・相対import検証、git diff --checkを実施。通常テスト・型チェック・サービス起動は未実施。契約集計はC-2/C-3と既存C-1がnot-calledであり、審査時の実行証跡取得に委ねる。
