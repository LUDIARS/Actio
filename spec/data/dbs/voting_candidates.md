# voting_candidates

> 候補日時。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M6 / Voting

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 候補 ID |
| `event_id` | text | NOT NULL, FK → `voting_events.id` | 投票イベント ID |
| `label` | text | NOT NULL | 候補ラベル (例: "3/20(木) 10:00〜11:00") |
| `sort_order` | integer | NOT NULL, default `0` | ソート順 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(event_id)` — `idx_candidate_event`
- FK: `event_id` → `voting_events.id`
