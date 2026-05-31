# groups

> グループ定義。グループ単位でモジュールの有効化を管理する。

- **ソース**: `src/db/schema.ts`
- **モジュール**: グループ

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | グループ ID |
| `name` | text | NOT NULL | グループ名 |
| `description` | text | nullable | 説明 |
| `enabled_modules` | text | nullable | 有効モジュール (カンマ区切り or JSON 文字列) |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
