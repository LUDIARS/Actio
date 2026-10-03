---
project: Actio
kind: task
created: 2026-10-03
reference: actio:d5c70c98-abad-4620-b95f-ebf2fc11732e
---

# 起動設定の残存ファイル整理

- [x] 既存契約C-1〜C-3を維持し、実装前にC-4と判定述語を定義する。
- [x] 不要な生成設定を削除し、catalogの旧provider指定を整理する。
- [x] README・開発規約・運用仕様・配備例をVault注入前提に揃える。
- [x] Composeの単体運用用途と残存制約をREADMEへ記載する。
- [x] 設定生成の再導入と起動口の消失を検出する回帰テストを追加する。
- コミット依頼・Revisor local PR・委託報告の結果は委託statusに記録する。

## 受け入れ条件

C-4 readDeploymentPolicySnapshot(): env-cli 設定と生成経路がなく、Ex の直接起動と単体 Compose を保持する

## 再利用と検証計画

既存のbootstrap、Vault secret-agent、暗号化config、素のnpm開発コマンドを採用する。
新たな設定ローダーやproviderは不要。`env:up`系はCompose専用なので削除しない。
過去のreview記録、互換APIのInfisicalフィールド、削除済みproviderの拒否テストは履歴・互換性のため保持する。

`augur plan`の「既存挙動をunitで固定」を、公開配備メタデータの回帰検査に具体化する。
正例はリポジトリのpackage/catalog/ファイル有無を検査し、負例は生成設定・dotenv起動・旧依存・旧catalog・Compose消失を検出する。
契約の観測は既存 `src/contract-runtime.ts` を再利用し、アプリ起動コードには検査を追加しない。
タスク本文の指示に従いテスト・起動は実行せず、審査側へ委ねる。`.env`とsecret値は読まない。
契約集計で未観測の条件は未充足として報告する。

## 境界

指定worktree `chore/remove-env-cli` だけを編集する。Composeとsecret-agentは変更しない。
サービス操作・実データ操作・push・merge・auto-mergeは実施しない。

## 静的検証

`augur contracts lint` は4契約・指摘0件。`git diff --check` は問題なし。
追加したTypeScript 3ファイルは既存checkoutのTypeScriptで構文変換し、診断0件。コードの実行・型チェックではない。
`inject apply --diff-base HEAD` はログ出力先をworktree内へ指定して適用した。
既存3契約のorphaned表示は今回の変更対象外。C-4の生成importを既存runtimeの実位置へ合わせた。
契約集計はテスト未実行のため未観測。起動・テスト・全体ビルドの成功は主張しない。
`DELEGATION_STARTED_AT` が未設定のため、集計の `--since` にはCcのrun作成時刻を使用した。
