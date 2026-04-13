# terms

> ターム (期間区分)。カリキュラムの期間区分。ターム単位で配置を管理・決定する。

- **ソース**: `src/db/curriculum-schema.ts`
- **モジュール**: M1 / カリキュラム

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | ターム ID |
| `name` | text | NOT NULL | ターム名 (例: "前期", "2026年度前期") |
| `start_date` | text | NOT NULL | 開始日 (`YYYY-MM-DD`) |
| `end_date` | text | NOT NULL | 終了日 (`YYYY-MM-DD`) |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
