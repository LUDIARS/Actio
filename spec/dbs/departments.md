# departments

> 学科マスタ。トップレイヤの設定項目。カリキュラムは学科の下にぶら下がる。

- **ソース**: `src/db/curriculum-schema.ts`
- **モジュール**: M1 / カリキュラム

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 学科 ID |
| `name` | text | NOT NULL | 学科名 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
