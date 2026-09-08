---
task: mac-database-connection
project: Actio
kind: 雑用
created: 2026-09-08
memory_links:
  - ../feature/local-auth-mode.md
  - ./2026-09-08-local-startup-verification.md
---
# Mac 移行後の PostgreSQL・Redis 接続設定

## 目的
Mac へのコンテナ移行完了後、Actio が移行先の PostgreSQL と Redis を使えるようにする。ユーザーから移行途中との指示があるため、移行完了と正式な接続先の確認を着手条件とする。

## 完了条件
- 移行担当者またはユーザーから、移行完了と利用する既存 DB・Redis の識別情報を確認できる。
- 接続先のポートは Excubitor catalog / ProcessMap の正本と照合し、認証情報は既存の秘密情報管理経路から設定する。秘密をタスク本文・リポジトリ・ログ・Discord に書かない。
- Actio 本体の実効接続先が移行先と一致する。旧 localhost への接続が残らず、別 DB の新規作成や SQLite への切り替えで代替しない。
- Actio の HTTP / WebSocket は引き続き Windows 側 loopback 専用・Cloudflare 非使用のローカルモードとする。Mac の DB 接続と Actio の公開 URL を混同しない。
- 接続先確認の結果を、秘密を除いて次の起動確認タスクへ引き渡す。動作検証が必要なら事前の明示許可と Concordia claim を得る。

## スコープ (編集可)
- Actio の運用接続設定。秘密情報は既存の秘密管理経路で扱う。
- 起動定義の変更が必要な場合に限り、Actio の専用 worktree 内の Excubitor 起動定義 (`excubitor.catalog.yaml`。 本リポジトリには未追跡のため、 追加時は正本の所在を先に確認する)。

## やらないこと
- Mac 側の移行作業、DB データ変更、他サービスの設定変更、Cc の接続クライアント実装。
