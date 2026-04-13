# pm_conflicts

> 双方向同期コンフリクト。Schedula 側と外部 (GitHub/Notion) 側で
> 競合が発生した場合のレコード。

- **ソース**: `src/db/pm-schema.ts`
- **モジュール**: M2 / PM

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | コンフリクト ID |
| `task_id` | text | NOT NULL | 対象タスク ID |
| `project_id` | text | NOT NULL | プロジェクト ID |
| `local_version` | text (JSON `Record<string, unknown>`) | NOT NULL, default `{}` | Schedula 側スナップショット |
| `external_version` | text (JSON `Record<string, unknown>`) | NOT NULL, default `{}` | 外部側スナップショット |
| `base_version` | text (JSON `Record<string, unknown>`) | NOT NULL, default `{}` | 前回同期時点のスナップショット |
| `resolution` | text | NOT NULL, default `manual` | 解決方針 (`auto_field_merge` / `claude_merge` / `force_external` / `manual`) |
| `resolved_data` | text (JSON `Record<string, unknown>`) | nullable | マージ結果 |
| `status` | text | NOT NULL, default `pending` | `pending` / `resolved` / `failed` |
| `created_at_text` | text | NOT NULL | 作成日時 (テキスト保存) |
| `resolved_at` | text | nullable | 解決日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(project_id)` — `idx_pm_conflicts_project`
- INDEX: `(status)` — `idx_pm_conflicts_status`
