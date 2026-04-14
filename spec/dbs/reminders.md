# reminders

> ユーザーごとのリマインダー。Web / API / Alexa 等から登録可能。

- **ソース**: `src/db/schema.ts`
- **モジュール**: カレンダー / リマインダー

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | リマインダー ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `title` | text | NOT NULL | タイトル |
| `description` | text | nullable | 詳細説明 |
| `remind_at` | text | NOT NULL | 通知日時 (ISO 8601) |
| `repeat_rule` | text | NOT NULL, default `none` | `none` / `daily` / `weekly` / `monthly` / `yearly` |
| `status` | text | NOT NULL, default `pending` | `pending` / `done` / `cancelled` |
| `source` | text | NOT NULL, default `web` | `web` / `api` / `alexa` |
| `original_text` | text | nullable | 自由テキスト入力時の元テキスト |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(user_id)` — `idx_reminder_user`
- INDEX: `(status)` — `idx_reminder_status`
- INDEX: `(remind_at)` — `idx_reminder_remind_at`
- FK: `user_id` → `users.id`
