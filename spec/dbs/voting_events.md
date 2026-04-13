# voting_events

> 日程調整 (Voting) のイベント。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M6 / Voting

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | イベント ID |
| `title` | text | NOT NULL | タイトル |
| `description` | text | NOT NULL, default `""` | 説明 |
| `created_by` | text | NOT NULL, FK → `users.id` | 作成者ユーザー ID |
| `deadline` | text | nullable | 回答期限 (ISO 8601) |
| `status` | text | NOT NULL, default `open` | `open` / `closed` |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- FK: `created_by` → `users.id`
