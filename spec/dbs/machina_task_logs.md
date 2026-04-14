# machina_task_logs

> MACHINA タスクの自動更新・アサイン変更・ステータス変更の履歴。
>
> ⚠️ MACHINA バックエンドは Discutere リポジトリに分離済み。テーブルは互換目的で残存。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M3 / MACHINA (旧)

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | ログ ID |
| `task_id` | text | NOT NULL, FK → `machina_tasks.id` | 対象タスク ID |
| `action` | text | NOT NULL | `created` / `updated` / `assigned` / `status_changed` / `priority_changed` / `relayed` |
| `previous_value` | text | nullable | 変更前の値 (JSON) |
| `new_value` | text | nullable | 変更後の値 (JSON) |
| `reason` | text | nullable | 変更理由 (AI 判定の根拠 など) |
| `trigger_message_id` | text | nullable | トリガー元メッセージ ID |
| `performed_by` | text | NOT NULL | 実行者 (`system` または `userId`) |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(task_id)` — `idx_machina_log_task`
- FK: `task_id` → `machina_tasks.id`
