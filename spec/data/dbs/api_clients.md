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
| `scopes` | text (JSON `string[]`) | NOT NULL, default `["calendar","reminders","schedules"]` | 許可スコープ。 `tasks` は opt-in (省略時の既定セットには含まれない) |
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

## スコープ一覧

外部 API (`/api/external/*`) のアクセス制御スコープ (`modules/external-api/middleware.ts` の
許可リストが正本)。

| スコープ | 対象 | 備考 |
|---------|------|------|
| `calendar` | `/api/external/calendar/*` | カレンダー予定の読み取り・作成・更新・削除 |
| `reminders` | `/api/external/reminders/*` | リマインダー設定・通知履歴の操作 |
| `schedules` | `/api/external/schedules/*` | プラン・マイプランの操作 |
| `tasks` | `/api/external/tasks/*` | `project_id` (GLAB `glab_project.id` 等の不透明参照) 指定タスクの read/write (create / update status・priority・estimatedMinutes)。GLAB×Calliope PM 連携 (2026-07-17 neco 最終裁定)。project_id が設定されていないタスクにはアクセス不可。**opt-in スコープ** (POST `/api/external/clients` で `scopes` 省略時の既定セットには含まれない) |
