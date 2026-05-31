# PM コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/pm/index.ts` | PM モジュール定義。プロジェクト・タスク・分析サブモジュールのバンドル |
| `modules/pm/routes.ts` | PM API ルート（プロジェクト・タスク管理、同期、分析） |
| `modules/pm/types.ts` | PM 固有の型定義（GitHub/Notion 設定、タスクステータス、優先度） |
| `modules/pm/sync/github-sync.ts` | GitHub Issues との双方向同期（fetch & update） |
| `modules/pm/sync/notion-sync.ts` | Notion Database との双方向同期 |
| `modules/pm/sync/diff-detector.ts` | タスク変更検出・差分計算 |
| `modules/pm/sync/writeback.ts` | Actio の変更を外部ソースに書き戻し |
| `modules/pm/sync/conflict-resolver.ts` | コンフリクト検出・マージ解決 |
| `modules/pm/validation/task-validator.ts` | タスク内容の検証・充実度スコア算出 |
| `modules/pm/analytics/critical-path.ts` | クリティカルパス分析・タスク分解推奨 |
| `modules/pm/analytics/gompertz.ts` | ゴンペルツ曲線フィッティング（バグ収束予測） |
| `modules/pm/reminder/deadline-checker.ts` | 納期警告・超過通知ロジック |

## 依存関係

- `src/db/repository.ts` — `pmProjectRepo`, `pmTaskRepo`, `pmTaskSnapshotRepo`, `pmMilestoneRepo`, `pmTaskValidationRepo`, `pmConflictRepo`, `pmAnalyticsCacheRepo` を使用
- `src/db/pm-schema.ts` — 全 PM テーブル定義

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
| POST | /api/pm/conflicts/:id/resolve | コンフリクト解決 |
| GET | /api/pm/projects/:id/analytics/:type | 分析レポート |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| PM ダッシュボード | `frontend/src/pages/PMDashboardPage.tsx` |
| プロジェクト詳細 | `frontend/src/pages/PMProjectPage.tsx` |
| 分析レポート | `frontend/src/pages/PMAnalyticsPage.tsx` |
