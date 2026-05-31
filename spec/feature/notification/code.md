# Notification コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/notification/routes.ts` | 通知設定・テンプレート・Webhook 管理の API ルート |
| `modules/notification/core/event-bus.ts` | インメモリイベントバス（イベント駆動アーキテクチャ） |
| `modules/notification/core/handler.ts` | イベントハンドリング・通知ディスパッチロジック |
| `modules/notification/core/template-engine.ts` | テンプレートレンダリング（変数置換・コードブロック） |
| `modules/notification/channels/platform-dispatcher.ts` | プラットフォーム別配信ルーティング |
| `modules/notification/channels/webhook/delivery.ts` | 汎用 Webhook 配信（HMAC 署名・リトライ） |
| `modules/notification/channels/webhook/routes.ts` | Webhook エンドポイント管理 API |
| `modules/notification/channels/slack/delivery.ts` | Slack Webhook / Bot 配信 |
| `modules/notification/channels/discord/delivery.ts` | Discord Webhook / Bot 配信 |
| `modules/notification/channels/line/delivery.ts` | LINE Notify 配信 |

## 依存関係

- `src/db/schema.ts` — `webhookEndpoints`, `notificationTemplates`, `webhookDeliveryLogs`, `notificationPreferences`, `notifications` テーブル定義

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET/POST | /api/webhooks | Webhook エンドポイント一覧・作成 |
| PUT/DELETE | /api/webhooks/:id | Webhook エンドポイント更新・削除 |
| GET/PUT | /api/webhooks/preferences | 通知設定取得・更新 |
| GET/POST/PUT/DELETE | /api/webhooks/templates | テンプレート CRUD |
| GET | /api/webhooks/notifications | 通知履歴 |
| POST | /api/webhooks/:id/test | テスト配信 |
| GET | /api/webhooks/:id/logs | 配信ログ |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| 通知設定 | `frontend/src/pages/NotificationsPage.tsx` |
