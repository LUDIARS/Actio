# curriculum_departments

> カリキュラム × 学科 中間テーブル。学科合同授業対応 (1カリキュラムが複数学科に所属)。

- **ソース**: `src/db/curriculum-schema.ts`
- **モジュール**: M1 / カリキュラム

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `curriculum_id` | text | NOT NULL, FK → `curricula.id` (ON DELETE CASCADE) | カリキュラム ID |
| `department_id` | text | NOT NULL, FK → `departments.id` (ON DELETE CASCADE) | 学科 ID |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(curriculum_id)` — `idx_cd_curriculum`
- INDEX: `(department_id)` — `idx_cd_department`
- FK: `curriculum_id` → `curricula.id` (CASCADE), `department_id` → `departments.id` (CASCADE)
