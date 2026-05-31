# pm_task_validations

> タスク内容の検証結果 (充実度スコア・改善提案 など)。

- **ソース**: `src/db/pm-schema.ts`
- **モジュール**: M2 / PM

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 検証 ID |
| `task_id` | text | NOT NULL | 対象タスク ID |
| `score` | integer | NOT NULL, default `0` | 充実度スコア |
| `issues` | text (JSON) | NOT NULL, default `[]` | 検出された問題 `{ type, message, severity }[]` |
| `suggestions` | text (JSON `string[]`) | NOT NULL, default `[]` | 改善提案リスト |
| `related_commits` | text (JSON) | NOT NULL, default `[]` | 関連コミット `{ hash, message, author, date }[]` |
| `test_files` | text (JSON `string[]`) | NOT NULL, default `[]` | 対応テストファイル |
| `validated_at` | text | NOT NULL | 検証日時 (ISO 8601) |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(task_id)` — `idx_pm_validations_task`
