# sync_logs

> 外部サービスとの同期結果ログ。

- **ソース**: `src/db/schema.ts`
- **モジュール**: カレンダー / 連携

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | ログ ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `service` | text | NOT NULL | サービス種別 (`google_calendar` / `notion`) |
| `action` | text | NOT NULL | アクション (`sync_push` / `sync_pull` / `create` / `update` / `delete`) |
| `local_event_id` | text | nullable | 対象のローカルイベント ID |
| `external_id` | text | nullable | 外部サービス側の ID |
| `status` | text | NOT NULL | `success` / `error` |
| `error_message` | text | nullable | エラー時のメッセージ |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(user_id)` — `idx_sync_log_user`
- INDEX: `(service)` — `idx_sync_log_service`
- FK: `user_id` → `users.id`
