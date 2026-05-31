# sessions

> JWT リフレッシュトークン管理。

- **ソース**: `src/db/schema.ts`
- **モジュール**: 認証 (Auth)

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | セッション ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `refresh_token` | text | NOT NULL, UNIQUE | リフレッシュトークン |
| `expires_at` | integer (timestamp) | NOT NULL | 有効期限 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `refresh_token`
- FK: `user_id` → `users.id`
