# votes

> 回答 (投票)。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M6 / Voting

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 投票 ID |
| `event_id` | text | NOT NULL, FK → `voting_events.id` | 投票イベント ID |
| `candidate_id` | text | NOT NULL, FK → `voting_candidates.id` | 候補 ID |
| `user_id` | text | NOT NULL, FK → `users.id` | 投票者ユーザー ID |
| `answer` | text | NOT NULL | 回答 (`ok`=○ / `maybe`=△ / `ng`=×) |
| `is_auto_reply` | integer (boolean) | NOT NULL, default `false` | 自動回答フラグ |
| `comment` | text | NOT NULL, default `""` | コメント |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(event_id, candidate_id, user_id)` — `unique_vote_per_user_candidate`
- INDEX: `(event_id)` — `idx_vote_event`
- INDEX: `(user_id)` — `idx_vote_user`
- FK: `event_id` → `voting_events.id`, `candidate_id` → `voting_candidates.id`, `user_id` → `users.id`
