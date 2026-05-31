# integration_settings

> 外部サービス連携設定。ユーザーごとの Notion / Google Calendar 等の
> 連携トークン・設定を保存する。

- **ソース**: `src/db/schema.ts`
- **モジュール**: カレンダー / 連携

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `service` | text | NOT NULL | サービス種別 (`google_calendar` / `notion`) |
| `access_token` | text | nullable | アクセストークン (暗号化推奨) |
| `refresh_token` | text | nullable | リフレッシュトークン |
| `token_expires_at` | integer | nullable | トークン有効期限 (epoch) |
| `config` | text (JSON `Record<string, unknown>`) | NOT NULL, default `{}` | サービス固有の設定 (例: Notion DB ID) |
| `is_active` | integer (boolean) | NOT NULL, default `true` | 連携有効/無効 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(user_id, service)` — `unique_user_service`
- INDEX: `(user_id)` — `idx_integration_user`
- FK: `user_id` → `users.id`
