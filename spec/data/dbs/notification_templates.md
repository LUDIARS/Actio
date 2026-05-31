# notification_templates

> イベント別通知テンプレート。`{variable}` 構文で変数置換可能。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M5 / 通知

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | テンプレート ID |
| `event` | text | NOT NULL | イベント名 (例: `reservation.created`) または `*` (デフォルト) |
| `platform` | text | NOT NULL, default `all` | `generic` / `slack` / `discord` / `line` / `all` |
| `title` | text | NOT NULL | テンプレートタイトル |
| `body` | text | NOT NULL | テンプレート本文 |
| `use_code_block` | integer (boolean) | NOT NULL, default `false` | コードブロック装飾を使うか |
| `code_block_lang` | text | nullable | コードブロックの言語 (シンタックスハイライト) |
| `is_default` | integer (boolean) | NOT NULL, default `false` | システムデフォルト (削除不可) |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
