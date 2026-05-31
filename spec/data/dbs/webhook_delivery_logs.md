# webhook_delivery_logs

> Webhook 配信ログ。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M5 / 通知

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | ログ ID |
| `webhook_id` | text | NOT NULL, FK → `webhook_endpoints.id` | Webhook ID |
| `delivery_id` | text | NOT NULL | 配信 ID |
| `event` | text | NOT NULL | イベント名 |
| `status_code` | integer | nullable | HTTP ステータスコード |
| `success` | integer (boolean) | NOT NULL | 成功フラグ |
| `retry_count` | integer | NOT NULL, default `0` | リトライ回数 |
| `latency_ms` | integer | NOT NULL, default `0` | 配信レイテンシ (ms) |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(webhook_id)` — `idx_delivery_webhook`
- FK: `webhook_id` → `webhook_endpoints.id`
