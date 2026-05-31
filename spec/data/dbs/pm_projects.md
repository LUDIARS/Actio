# pm_projects

> PM プロジェクト。GitHub / Notion と接続して同期するプロジェクト。

- **ソース**: `src/db/pm-schema.ts`
- **モジュール**: M2 / PM

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | プロジェクト ID |
| `name` | text | NOT NULL | プロジェクト名 |
| `source` | text | NOT NULL | 接続先 (`github` / `notion`) |
| `source_config` | text (JSON `Record<string, string>`) | NOT NULL | 接続設定 (owner, repo, token, database_id 等) |
| `sync_interval_minutes` | integer | NOT NULL, default `15` | 同期間隔 (分) |
| `last_synced_at` | text | nullable | 最終同期日時 (ISO 8601) |
| `owner_id` | text | NOT NULL | 所有者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(owner_id)` — `idx_pm_projects_owner`
