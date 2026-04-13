# app_settings

> アプリ全体設定の key-value ストア。GUI 経由で管理する。

- **ソース**: `src/db/schema.ts`
- **モジュール**: 運用 / 設定

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `key` | text | PRIMARY KEY | 設定キー |
| `value` | text | NOT NULL | 設定値 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `key`
