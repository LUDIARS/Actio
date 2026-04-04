# Smart Scheduler コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/smart-scheduler/routes.ts` | タスク登録・ソルバー実行・結果確定の API ルート |
| `modules/smart-scheduler/availability.ts` | グループメンバーの空き状況計算 (70% 閾値) |
| `modules/smart-scheduler/solver.ts` | DP ベースのバックトラッキングソルバー |

## 依存関係

- `src/db/repository.ts` — `schedulingTaskRepo`, `schedulingResultRepo`, `groupRepo`, `personalEventRepo` を使用
- `src/db/schema.ts` — `schedulingTasks`, `schedulingResults` テーブル定義
- `modules/holiday/` — 休日考慮ユーティリティ

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/smart-scheduler/tasks | タスク一覧 |
| POST | /api/smart-scheduler/tasks | タスク登録 |
| PUT | /api/smart-scheduler/tasks/:id | タスク更新 |
| DELETE | /api/smart-scheduler/tasks/:id | タスク削除 |
| POST | /api/smart-scheduler/solve | 自動配置実行 |
| GET | /api/smart-scheduler/results | 配置結果一覧 |
| POST | /api/smart-scheduler/results/:id/confirm | 結果確定 |
| POST | /api/smart-scheduler/results/:id/reject | 結果却下 |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| オートスケジューラ | `frontend/src/pages/SmartSchedulerPage.tsx` |
