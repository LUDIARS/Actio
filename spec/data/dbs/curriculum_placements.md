# curriculum_placements

> カリキュラム時間割配置。ターム単位で管理。
> 自動配置・手動配置の結果を DB に保存し、入れ替え調整後にプラン化する。

- **ソース**: `src/db/curriculum-schema.ts`
- **モジュール**: M1 / カリキュラム

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 配置 ID |
| `term_id` | text | NOT NULL, FK → `terms.id` | ターム ID |
| `curriculum_id` | text | NOT NULL, FK → `curricula.id` | カリキュラム ID |
| `day` | integer | NOT NULL | 曜日 (0=月 〜 6=日) |
| `period` | integer | NOT NULL | コマ (0始まり) |
| `room_id` | text | nullable | 教室 ID |
| `candidate_count` | integer | NOT NULL, default `0` | 配置候補数 (自動配置時の候補数) |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(term_id, day, period, room_id)` — `unique_placement_slot`
- INDEX: `(term_id)` — `idx_placement_term`
- INDEX: `(curriculum_id)` — `idx_placement_curriculum`
- FK: `term_id` → `terms.id`, `curriculum_id` → `curricula.id`
