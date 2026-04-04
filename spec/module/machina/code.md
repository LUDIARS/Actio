# MACHINA コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/machina/routes.ts` | チャンネル監視・タスク管理・Webhook 受信の API ルート |

## 依存関係

- `src/db/repository.ts` — `machinaChannelMonitorRepo`, `machinaTaskRepo`, `machinaTaskLogRepo` を使用
- `src/db/schema.ts` — `machinaChannelMonitors`, `machinaTasks`, `machinaTaskLogs` テーブル定義
- `modules/pm/` — PM リレーインターフェース（アダプタパターン）

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET/POST | /api/machina/monitors | チャンネル監視設定一覧・作成 |
| PUT/DELETE | /api/machina/monitors/:id | チャンネル監視設定更新・削除 |
| GET | /api/machina/tasks | タスク一覧 |
| PUT | /api/machina/tasks/:id | タスク更新 |
| POST | /api/machina/tasks/:id/relay | PM リレー |
| POST | /api/machina/webhook/slack | Slack Webhook 受信 |
| POST | /api/machina/webhook/discord | Discord Webhook 受信 |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| MACHINA | `frontend/src/pages/MachinaPage.tsx` |
