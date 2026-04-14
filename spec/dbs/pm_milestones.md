# pm_milestones

> 外部マイルストーン。

- **ソース**: `src/db/pm-schema.ts`
- **モジュール**: M2 / PM

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | マイルストーン ID |
| `project_id` | text | NOT NULL | プロジェクト ID |
| `external_id` | text | NOT NULL | 外部 ID |
| `title` | text | NOT NULL | タイトル |
| `description` | text | nullable | 説明 |
| `due_date` | text | nullable | 納期 (ISO 8601) |
| `state` | text | NOT NULL, default `open` | `open` / `closed` |
| `external_updated_at` | text | nullable | 外部更新日時 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(project_id)` — `idx_pm_milestones_project`
