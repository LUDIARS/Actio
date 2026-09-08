---
task: local-startup-verification
project: Actio
kind: テスト
created: 2026-09-08
memory_links:
  - ./2026-09-08-mac-database-connection.md
  - ../feature/local-auth-mode.md
---
# Mac の DB 接続準備後に Actio ローカルモードを起動確認する

## 目的
[`2026-09-08-mac-database-connection.md`](./2026-09-08-mac-database-connection.md) の接続準備を前提に、Actio のローカルモードを実運用に向けて確認する。コンテナ移行待ちの間は起動を繰り返さない。

## 完了条件
- 起動・動作確認の明示許可と Mac 側の接続準備完了を確認する。
- ローカルモード実装と Excubitor 起動定義について、レビュー結果だけでなく Actio 本体の実際の checkout・配備内容も照合する。確認のために無断で main を更新しない。
- Concordia に対象サービスの testing claim を宣言し、競合がなければ Excubitor 経由で Actio 本体から API と画面を起動する。worktree・複製から起動しない。
- DB・Redis の readiness、トークンなしの `/api/auth/me`、初回画面表示、WebSocket 接続を確認する。ローカル専用ユーザーの通常権限が保たれる。
- Cloudflare / 転送ヘッダー、非ローカル Host / Origin を持つ要求が拒否されることを確認する。実データを変更する確認は対象と後始末を先に決め、明示許可の範囲で行う。
- 成否と未確認項目を該当 TestWorkflow スレッドへ記録し、配送を確認する。成功時の稼働継続・失敗時の停止を報告し、全経路で claim を解放する。

## スコープ (編集可)
- `E:/Document/Ars/Actio` 本体のビルド成果物と、許可された起動確認用の一時成果物。
- Excubitor による Actio のサービス操作、Concordia の testing claim / release、該当 TestWorkflow の確認記録。

## やらないこと
- 不具合の修正そのもの。 必要なら別の実装タスクと worktree に分離する。
- 無断の merge・main 更新・DB 移行。
