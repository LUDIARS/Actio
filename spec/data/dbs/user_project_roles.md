# user_project_roles

> ユーザーがグループ (プロジェクト) ごとに担当する業務上のロール。
> `group_members.role` (owner/admin/member) とは別に、業務上の役割を自由入力する。

- **ソース**: `src/db/schema.ts`
- **モジュール**: 認証 (Auth) / グループ

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `role_name` | text | NOT NULL | 業務ロール (例: "デザイナー", "PM", "エンジニア") |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(user_id, group_id, role_name)` — `unique_user_project_role`
- INDEX: `(user_id)` — `idx_user_project_role_user`
- INDEX: `(group_id)` — `idx_user_project_role_group`
- FK: `user_id` → `users.id`, `group_id` → `groups.id`
