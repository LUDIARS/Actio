# schedule_entries

> 確定された実スケジュール (タームベース)。
> カリキュラムの「プラン」から確定された実際のスケジュール。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M1 / スケジュール

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | エントリ ID |
| `day` | integer | NOT NULL | 曜日 (0=月 〜 6=日) |
| `period` | integer | NOT NULL | コマ |
| `curriculum_id` | text | NOT NULL | カリキュラム ID |
| `room_id` | text | nullable, FK → `rooms.id` | 教室 ID |
| `instructor_id` | text | NOT NULL | 講師 ID |
| `candidate_count` | integer | NOT NULL, default `0` | 候補数 |
| `is_confirmed` | integer (boolean) | NOT NULL, default `false` | 確定済みか |
| `term_id` | text | NOT NULL | ターム ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(day, period, room_id, term_id)` — `unique_slot_per_room`
- INDEX: `(term_id)` — `idx_schedule_term`
- INDEX: `(instructor_id)` — `idx_schedule_instructor`
- FK: `room_id` → `rooms.id`
