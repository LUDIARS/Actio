---
task: sprint-chat-integration
project: At
kind: feature
created: 2026-09-27
memory_links: []
---

# チャンネルで完結するバックログ受付とスプリント運営

## 依頼

Cc・Discord・Slackと連携し、バックログ登録、スプリント実装状況、レビュー・評価・振り返りの投稿、目標・タスク一覧・期日を含む毎朝のスプリントサマリを提供する。

Cc利用時はCc経由、CcなしではActioに登録したDiscord Botで独立動作する。バックログ投稿の内容を確認し、不足情報と妥当性の問題を具体的に問い返す。追記先のスレッドを作って案内する。通常チャンネルで運用し、役目を終えたスプリントのチャンネルを保管する。会話内容をWebのログで閲覧可能にする。

## 設計と受入条件

正本: `spec/feature/sprint-chat-integration.md` / `AT-SPRINT-CHAT-INTEGRATION`。

目的、配送経路、受付状態、人間の判断、毎朝の配信、保管・ログ、変更範囲と8件の受入条件を同仕様にまとめる。実装対象はActioとCcの連携部分。旧フォーラムの一括移行は含めない。CcなしのSlack直接接続は人間への確認事項として残す。

## 関連する既存作業

Actio local PR #2046の一時登録・要整理対応は別branchでTest OK、実画面の確認証跡とマージが未完了。本タスクで同branchへ追加commitしない。

プロジェクト登録作業の残件は `.tmp/anatomia-registration-resume-20260927.json` に記録済み。本機能の設計承認に混ぜて完了扱いにしない。

## 確認根拠

PfのActio UX revision 1、既存repo仕様、Anatomia context/planの結果と現行コードを照合済み。Genius照会は設定エラーで未取得。2026-09-27「実装開始添付可」と「OKそれで実装はじめて」を受け、Actio・Cc・Diの専用worktreeに実装。配備設定・外部チャンネルは未変更、テスト・実投稿・再起動・マージは未実行。

## 実装と確認

Actioに明示命令受付、内容確認、独立チーム/プロジェクト、通常チャンネルのスプリント投稿、時差対応日次サマリ、保管前ログ確認、Webの接続設定/受付確定/ログ/Di参加設定/配送復旧を追加。議論判断はDi専用API、Cc利用時の外部I/OはCcの認証済みポート。状態の正本はActio。

関連branch: Cc `feat/actio-chat-transport`、Di `feat/actio-discussion-participation`。いずれも配備の有効化前に対応版が必要。静的型確認を実施。受付重複・通常会話の除外・削除・lease・結果不明時の再投稿抑止のテストを追加したが、明示許可がないため未実行。
