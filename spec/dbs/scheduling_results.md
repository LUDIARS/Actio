# scheduling_results

> 自動配置結果。draft (提案中) → confirmed (確定) / rejected (却下) のライフサイクルを持つ。

- **ソース**: `src/db/schema.ts`
- **モジュール**: スマートスケジューラ

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 結果 ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `status` | text | NOT NULL, default `draft` | `draft` / `confirmed` / `rejected` |
| `placements` | text (JSON) | NOT NULL, default `[]` | 配置結果 `Array<{ taskId, title, day, period, duration, score }>` |
| `total_score` | integer | NOT NULL, default `0` | 配置スコア合計 |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(group_id)` — `idx_schresult_group`
- FK: `group_id` → `groups.id`
