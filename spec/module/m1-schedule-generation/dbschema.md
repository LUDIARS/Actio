# M1: 時間割自動生成 DBスキーマ

## curriculumPlacements テーブル

カリキュラムの時間割配置データ。スキーマファイル: `src/db/curriculum-schema.ts`

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 配置 ID |
| termId | text (FK → terms.id) | ターム ID |
| curriculumId | text (FK → curricula.id) | カリキュラム ID |
| day | integer | 曜日 (0=月〜6=日) |
| period | integer | コマ (0始まり) |
| roomId | text | 教室 ID (nullable) |
| candidateCount | integer | 配置候補数 (default: 0) |
| createdAt | integer (timestamp) | 作成日時 |

**UNIQUE**: (termId, day, period, roomId)
**INDEX**: termId, curriculumId

## scheduleEntries テーブル

確定済みスケジュール。スキーマファイル: `src/db/schema.ts`

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | エントリ ID |
| day | integer | 曜日 |
| period | integer | コマ |
| curriculumId | text | カリキュラム ID |
| roomId | text (FK → rooms.id) | 教室 ID (nullable) |
| instructorId | text | 講師 ID |
| candidateCount | integer | 候補数 (default: 0) |
| isConfirmed | integer (boolean) | 確定済みか (default: false) |
| termId | text | ターム ID |
| createdAt | integer (timestamp) | 作成日時 |

**UNIQUE**: (day, period, roomId, termId)
**INDEX**: termId, instructorId
