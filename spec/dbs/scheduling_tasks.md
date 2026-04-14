# scheduling_tasks

> 自動配置対象のタスク。グループの空き状況を見て自動配置するための「入れたい予定」。

- **ソース**: `src/db/schema.ts`
- **モジュール**: スマートスケジューラ

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | タスク ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `title` | text | NOT NULL | タイトル |
| `duration` | integer | NOT NULL, default `1` | 所要コマ数 (1コマ=1時間) |
| `priority` | integer | NOT NULL, default `0` | 優先度 (大きいほど優先配置) |
| `preferred_days` | text (JSON `number[]`) | NOT NULL, default `[]` | 希望曜日 (空=どの曜日でも可) |
| `preferred_periods` | text (JSON `number[]`) | NOT NULL, default `[]` | 希望コマ (空=どのコマでも可) |
| `instructor_id` | text | nullable | 担当講師 ID (講師の空き時間に合わせて配置) |
| `status` | text | NOT NULL, default `pending` | `pending` / `placed` / `failed` |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(group_id)` — `idx_schtask_group`
- INDEX: `(status)` — `idx_schtask_status`
- FK: `group_id` → `groups.id`
