# pm_task_snapshots

> タスクの変更履歴スナップショット。

- **ソース**: `src/db/pm-schema.ts`
- **モジュール**: M2 / PM

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | スナップショット ID |
| `task_id` | text | NOT NULL | 対象タスク ID |
| `change_type` | text | NOT NULL | `created` / `updated` / `closed` / `reopened` |
| `changed_fields` | text (JSON) | NOT NULL, default `{}` | 変更フィールド `Record<string, { before, after }>` |
| `snapshot_data` | text (JSON `Record<string, unknown>`) | NOT NULL, default `{}` | 変更時点の全データ |
| `detected_at` | text | NOT NULL | 検知日時 (ISO 8601) |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(task_id)` — `idx_pm_snapshots_task`
