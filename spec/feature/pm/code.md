# PM コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/pm/index.ts` | PM モジュール定義。プロジェクト・タスク・分析サブモジュールのバンドル |
| `modules/pm/routes.ts` | PM API ルート（プロジェクト・タスク管理、同期、分析） |
| `modules/pm/types.ts` | PM 固有の型定義（GitHub/Notion 設定、タスクステータス、優先度） |
| `modules/pm/sync/github-sync.ts` | GitHub Issues との双方向同期（fetch & update） |
| `modules/pm/sync/notion-sync.ts` | Notion Database との双方向同期 |
| `modules/pm/sync/diff-detector.ts` | 本文ハッシュ (差分検知用) |
| `modules/pm/sync/github-commits.ts` | 関連コミット・変更ファイル・リポジトリのファイル一覧の取得 |
| `modules/pm/domain/tracked-task.ts` | 同期で比較・マージするフィールドと変換 |
| `modules/pm/domain/sync-plan.ts` | Pull 時のタスク単位の判断 (base との差で外部変更を判定) |
| `modules/pm/domain/sync-schedule.ts` | 定期同期の実行判定 |
| `modules/pm/domain/conflict-policy.ts` | コンフリクト解決の 3 段階 |
| `modules/pm/domain/merge-prompt.ts` | LLM マージの依頼文と応答の検証 |
| `modules/pm/domain/github-labels.ts` | 書き戻し時の GitHub ラベル (ステータス・優先度) |
| `modules/pm/domain/notifications.ts` | `pm.*` 通知の意図 |
| `modules/pm/application/sync-project.ts` | 双方向同期ユースケース (REST・WS・tick 共通、同時実行の拒否) |
| `modules/pm/application/resolve-conflict.ts` | コンフリクトの手動解決・LLM マージ |
| `modules/pm/application/reminder-cycle.ts` | リマインダー巡回 |
| `modules/pm/application/status-change-validation.ts` | review への変更時の関連コミット・テスト照合 |
| `modules/pm/application/analytics-report.ts` | 進捗予測・ゴンペルツ・総合レポート (キャッシュ) |
| `modules/pm/infra/*` | repository・外部 API による port の実装と deps の組み立て |
| `modules/pm/llm/merge-client.ts` | OpenAI 互換の LLM 呼び出し (内容審査と同じ設定) |
| `modules/pm/secret/*` | 接続トークンの暗号化・応答での秘匿 |
| `modules/pm/runtime/tick.ts` | 1 分 tick (定期同期・リマインダー・LLM マージ) |
| `modules/pm/validation/task-validator.ts` | タスク内容の検証・充実度スコア算出 |
| `modules/pm/validation/test-matching.ts` | 変更ファイルと対応テストの照合 |
| `modules/pm/analytics/critical-path.ts` | クリティカルパス分析・タスク分解推奨 |
| `modules/pm/analytics/progress-forecast.ts` | 担当者ごとの完了速度による進捗予測 |
| `modules/pm/analytics/bug-series.ts` | ゴンペルツの入力 (累積発見・修正) |
| `modules/pm/analytics/gompertz.ts` | ゴンペルツ曲線フィッティング（バグ収束予測） |
| `modules/pm/reminder/deadline-checker.ts` | 納期警告・超過の判定とリマインダー設定 |

設計と不変条件: [`completion.md`](completion.md)

## 依存関係

- `src/db/repository.ts` — `pmProjectRepo`, `pmTaskRepo`, `pmTaskSnapshotRepo`, `pmMilestoneRepo`, `pmTaskValidationRepo`, `pmConflictRepo`, `pmAnalyticsCacheRepo` を使用
- `src/db/pm-schema.ts` — 全 PM テーブル定義
- `modules/task/notifications/enqueue.ts` — 通知の送信箱 (`pm.*` もここに積み、Memoria へ配送)

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET/POST | /api/pm/projects | プロジェクト一覧・作成 |
| GET/PUT/DELETE | /api/pm/projects/:id | プロジェクト詳細・更新・削除 |
| POST | /api/pm/projects/:id/sync | 同期実行 |
| GET | /api/pm/projects/:id/tasks | タスク一覧 |
| GET/PUT | /api/pm/tasks/:id | タスク詳細・更新 |
| POST | /api/pm/tasks/:id/validate | タスク検証 |
| GET | /api/pm/projects/:id/conflicts | コンフリクト一覧 |
| POST | /api/pm/conflicts/:id/resolve | コンフリクト解決 (force_external / keep_local / manual) |
| POST | /api/pm/conflicts/:id/auto-merge | LLM マージ (提供元未設定なら 503) |
| GET | /api/pm/projects/:id/sync/status | 同期状態 (syncing / idle / error) と前回結果 |
| GET/PUT | /api/pm/projects/:id/reminders | リマインダー設定 |
| POST | /api/pm/projects/:id/reminders/test | 通知対象の確認 (送信しない) |
| GET | /api/pm/tasks/:id/related-commits | 関連コミット |
| GET | /api/pm/tasks/:id/test-coverage | 対応テスト |
| GET | /api/pm/projects/:id/analytics/:type | 分析レポート (progress / critical-path / decomposition / gompertz / report) |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| PM ダッシュボード | `frontend/src/pages/PMDashboardPage.tsx` |
| プロジェクト詳細 | `frontend/src/pages/PMProjectPage.tsx` |
| 分析レポート | `frontend/src/pages/PMAnalyticsPage.tsx` |
