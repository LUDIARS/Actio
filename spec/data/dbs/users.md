# users

> ユーザーの基本情報と認証データ。パスワード認証 / Google OAuth 両対応。

- **ソース**: `src/db/schema.ts`
- **モジュール**: 認証 (Auth)

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | ユーザー ID |
| `name` | text | NOT NULL | 表示名 |
| `email` | text | NOT NULL, UNIQUE | メールアドレス |
| `role` | text | NOT NULL, default `general` | ロール (`admin` / `group_leader` / `general`) |
| `major` | text | nullable | 専攻 |
| `password_hash` | text | nullable | bcrypt パスワードハッシュ (OAuth ユーザーは null) |
| `google_id` | text | UNIQUE, nullable | Google アカウント ID |
| `google_access_token` | text | nullable | Google OAuth アクセストークン |
| `google_refresh_token` | text | nullable | Google OAuth リフレッシュトークン |
| `google_token_expires_at` | integer | nullable | Google トークン有効期限 (epoch) |
| `google_scopes` | text (JSON `string[]`) | nullable | 認可済みスコープ |
| `calendar_access_id` | text | nullable | Google Calendar 連携用 ID |
| `last_login_at` | integer (timestamp) | nullable | 最終ログイン日時 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `email`, `google_id`
