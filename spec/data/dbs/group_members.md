# group_members

> グループメンバーシップ (多対多)。ユーザーは複数グループに所属可能。

- **ソース**: `src/db/schema.ts`
- **モジュール**: グループ

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `role` | text | NOT NULL, default `member` | グループ内ロール (`owner` / `admin` / `member`) |
| `joined_at` | integer (timestamp) | NOT NULL, default `now()` | 参加日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(group_id, user_id)` — `unique_group_member`
- INDEX: `(user_id)` — `idx_group_member_user`
- INDEX: `(group_id)` — `idx_group_member_group`
- FK: `group_id` → `groups.id`, `user_id` → `users.id`
