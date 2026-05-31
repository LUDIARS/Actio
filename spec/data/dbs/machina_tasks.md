# machina_tasks

> Slack/Discord のログから自動生成されたタスク。
>
> ⚠️ MACHINA バックエンドは Discutere リポジトリに分離済み。テーブルは互換目的で残存。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M3 / MACHINA (旧)

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | タスク ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `title` | text | NOT NULL | タイトル |
| `description` | text | nullable | 詳細 |
| `status` | text | NOT NULL, default `pending` | `pending` / `in_progress` / `done` / `cancelled` |
| `priority` | text | NOT NULL, default `medium` | `low` / `medium` / `high` / `critical` |
| `assignee_id` | text | nullable | アサインされたユーザー ID |
| `due_date` | text | nullable | 納期 (ISO 8601) |
| `source` | text | NOT NULL, default `auto` | `auto` (自動検出) / `command` / `manual` |
| `source_platform` | text | nullable | `slack` / `discord` / `manual` |
| `source_message_id` | text | nullable | 生成元メッセージ ID |
| `source_channel_id` | text | nullable | 生成元チャンネル ID |
| `source_text` | text | nullable | 解析した原文 |
| `confidence` | integer | NOT NULL, default `0` | AI 解析の信頼度 (0.0〜1.0) |
| `is_critical_path` | integer (boolean) | NOT NULL, default `false` | クリティカルパス上か |
| `relayed_to_pm` | integer (boolean) | NOT NULL, default `false` | PM (M2) へのリレー済みか |
| `pm_task_id` | text | nullable | PM 側のタスク ID |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(group_id)` — `idx_machina_task_group`
- INDEX: `(status)` — `idx_machina_task_status`
- INDEX: `(assignee_id)` — `idx_machina_task_assignee`
- INDEX: `(due_date)` — `idx_machina_task_due`
- INDEX: `(priority)` — `idx_machina_task_priority`
- FK: `group_id` → `groups.id`
