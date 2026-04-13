# webhook_endpoints

> Webhook / Bot 配信先設定。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M5 / 通知

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | エンドポイント ID |
| `url` | text | NOT NULL | Webhook URL |
| `events` | text (JSON `string[]`) | NOT NULL, default `[]` | 配信イベント名配列 |
| `secret` | text | NOT NULL | シークレット (署名検証用) |
| `platform` | text | NOT NULL, default `generic` | `generic` / `slack` / `discord` / `line` |
| `send_method` | text | NOT NULL, default `webhook` | `webhook` / `bot` |
| `bot_token` | text | nullable | Bot トークン (bot 送信時) |
| `channel_id` | text | nullable | チャンネル/ルーム ID (bot 送信時) |
| `is_active` | integer (boolean) | NOT NULL, default `true` | 有効/無効 |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `fail_count` | integer | NOT NULL, default `0` | 失敗回数 |
| `last_delivered_at` | integer (timestamp) | nullable | 最終配信日時 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
