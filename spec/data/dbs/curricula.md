# curricula

> カリキュラム (学科 × 講師)。学科の下に複数存在し、複数の学科を持てる (合同授業対応)。

- **ソース**: `src/db/curriculum-schema.ts`
- **モジュール**: M1 / カリキュラム

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | カリキュラム ID |
| `name` | text | NOT NULL | カリキュラム名 |
| `department_id` | text | NOT NULL, FK → `departments.id` | 主学科 ID (後方互換) |
| `periods` | integer | NOT NULL, default `1` | この科目が必要とする総コマ数 |
| `instructor_id` | text | nullable, FK → `instructors.id` | 担当講師 ID (未アサイン許容) |
| `term_id` | text | nullable, FK → `terms.id` | 所属ターム ID (未設定許容) |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(department_id)` — `idx_curricula_department`
- INDEX: `(instructor_id)` — `idx_curricula_instructor`
- FK: `department_id` → `departments.id`, `instructor_id` → `instructors.id`, `term_id` → `terms.id`

## 関連

- 合同授業の場合は `curriculum_departments` 中間テーブルで複数学科に紐付ける。
