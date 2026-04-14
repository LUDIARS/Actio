# instructor_available_slots

> 講師ごとに「どの曜日の何コマ目に出講可能か」を管理。
> 1行 = 1つの曜日 × 複数のコマ番号。

- **ソース**: `src/db/curriculum-schema.ts`
- **モジュール**: M1 / カリキュラム

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `instructor_id` | text | NOT NULL, FK → `instructors.id` | 講師 ID |
| `day` | integer | NOT NULL | 曜日 (0=月 〜 6=日) |
| `periods` | text (JSON `number[]`) | NOT NULL | 出講可能なコマ番号配列 (例: `[1,2,3]`) |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(instructor_id)` — `idx_available_slots_instructor`
- FK: `instructor_id` → `instructors.id`
