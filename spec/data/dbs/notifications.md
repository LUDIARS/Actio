# notifications

> アプリ内通知 (受信箱)。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M5 / 通知

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 通知 ID |
| `user_id` | text | NOT NULL | 受信ユーザー ID |
| `event` | text | NOT NULL | イベント名 |
| `channel` | text | NOT NULL | チャンネル |
| `title` | text | NOT NULL | タイトル |
| `body` | text | NOT NULL | 本文 |
| `is_read` | integer (boolean) | NOT NULL, default `false` | 既読フラグ |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(user_id)` — `idx_notification_user`
