# M1: カリキュラム管理 DBスキーマ

スキーマファイル: `src/db/curriculum-schema.ts`

## departments テーブル

学科情報。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 学科 ID |
| name | text | 学科名 |
| createdAt | integer (timestamp) | 作成日時 |

## instructors テーブル

講師情報。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 講師 ID |
| name | text | 講師名 |
| createdAt | integer (timestamp) | 作成日時 |

## curricula テーブル

カリキュラム（授業科目）。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | カリキュラム ID |
| name | text | カリキュラム名 |
| departmentId | text (FK → departments.id) | 主学科 ID |
| periods | integer | 必要コマ数 (default: 1) |
| instructorId | text (FK → instructors.id) | 担当講師 ID (nullable) |
| termId | text (FK → terms.id) | ターム ID (nullable) |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: departmentId, instructorId

## curriculumDepartments テーブル

学科合同授業の中間テーブル。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| curriculumId | text (FK → curricula.id, CASCADE) | カリキュラム ID |
| departmentId | text (FK → departments.id, CASCADE) | 学科 ID |

**INDEX**: curriculumId, departmentId

## terms テーブル

ターム（期間区分）。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ターム ID |
| name | text | ターム名 |
| startDate | text | 開始日 (YYYY-MM-DD) |
| endDate | text | 終了日 (YYYY-MM-DD) |
| createdAt | integer (timestamp) | 作成日時 |

## instructorAvailableSlots テーブル

講師の出講可能スロット。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| instructorId | text (FK → instructors.id) | 講師 ID |
| day | integer | 曜日 (0=月〜6=日) |
| periods | text (JSON) | 出講可能コマ番号配列 `[1,2,3]` |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: instructorId

## rooms テーブル

教室情報。スキーマファイル: `src/db/schema.ts`

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 教室 ID |
| name | text | 教室名 |
| capacity | integer | 定員 |
| type | text | 教室タイプ |
| equipment | text (JSON) | 設備リスト配列 |
| createdAt | integer (timestamp) | 作成日時 |
