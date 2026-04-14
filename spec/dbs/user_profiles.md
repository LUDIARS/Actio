# user_profiles

> ユーザーの自己紹介・表示名・アバター。`users` と 1:1。

- **ソース**: `src/db/schema.ts`
- **モジュール**: 認証 (Auth)

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | プロフィール ID |
| `user_id` | text | NOT NULL, UNIQUE, FK → `users.id` | ユーザー ID |
| `bio` | text | NOT NULL, default `""` | 自己紹介 |
| `display_name` | text | nullable | 表示名 (`users.name` と別に設定可) |
| `avatar_url` | text | nullable | アバター URL |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `user_id`
- FK: `user_id` → `users.id`
