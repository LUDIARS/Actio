# api_clients

> 外部 API 連携用のクライアント認証情報。各ユーザーが API クライアントを発行可能。

- **ソース**: `src/db/schema.ts`
- **モジュール**: 認証 (Auth)

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `user_id` | text | NOT NULL, FK → `users.id` | 発行ユーザー ID |
| `client_id` | text | NOT NULL, UNIQUE | クライアント ID (公開値、再発行可) |
| `client_secret_hash` | text | NOT NULL | クライアントシークレット (bcrypt ハッシュ) |
| `name` | text | NOT NULL | 表示名 |
| `scopes` | text (JSON `string[]`) | NOT NULL, default `["calendar","reminders","schedules"]` | 許可スコープ |
| `is_active` | integer (boolean) | NOT NULL, default `false` | 有効/無効 |
| `last_used_at` | integer (timestamp) | nullable | 最終使用日時 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `client_id`
- INDEX: `(user_id)` — `idx_api_client_user`
- INDEX: `(client_id)` — `idx_api_client_client_id`
- FK: `user_id` → `users.id`
