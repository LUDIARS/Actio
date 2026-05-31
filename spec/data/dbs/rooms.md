# rooms

> 教室・会議室マスタ。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M1 / 施設予約

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 教室 ID |
| `name` | text | NOT NULL | 教室名 |
| `capacity` | integer | NOT NULL | 収容人数 |
| `type` | text | NOT NULL | 教室種別 |
| `equipment` | text (JSON `string[]`) | NOT NULL, default `[]` | 設備リスト |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
