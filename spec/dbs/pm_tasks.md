# pm_tasks

> 外部ソースから同期されたタスク。

- **ソース**: `src/db/pm-schema.ts`
- **モジュール**: M2 / PM

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | タスク ID |
| `project_id` | text | NOT NULL | プロジェクト ID |
| `external_id` | text | NOT NULL | 外部 ID (Issue 番号 / Notion ページ ID) |
| `external_url` | text | nullable | 外部 URL |
| `title` | text | NOT NULL | タイトル |
| `description` | text | nullable | 説明 |
| `status` | text | NOT NULL, default `open` | `open` / `in_progress` / `review` / `closed` |
| `priority` | text | NOT NULL, default `medium` | `low` / `medium` / `high` / `critical` |
| `assignees` | text (JSON `string[]`) | NOT NULL, default `[]` | 担当者リスト |
| `labels` | text (JSON `string[]`) | NOT NULL, default `[]` | ラベルリスト |
| `due_date` | text | nullable | 納期 (ISO 8601) |
| `milestone_external_id` | text | nullable | マイルストーン外部 ID |
| `milestone_name` | text | nullable | マイルストーン名 |
| `estimated_hours` | real | nullable | 見積工数 (時間) |
| `blocked_by` | text (JSON `string[]`) | NOT NULL, default `[]` | 依存タスク ID 配列 |
| `description_hash` | text | nullable | 説明ハッシュ (差分検知用) |
| `dirty_flag` | integer | NOT NULL, default `0` | ローカル変更ありフラグ |
| `local_updated_at` | text | nullable | ローカル更新日時 |
| `external_updated_at` | text | nullable | 外部更新日時 |
| `last_synced_at` | text | nullable | 最終同期日時 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(project_id)` — `idx_pm_tasks_project`
- INDEX: `(status)` — `idx_pm_tasks_status`
- INDEX: `(due_date)` — `idx_pm_tasks_due_date`
- INDEX: `(dirty_flag)` — `idx_pm_tasks_dirty`
