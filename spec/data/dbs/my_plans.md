# my_plans

> 週間ルーティーン。基本パターン (`basic`) と特別パターン (`special`) を持ち、
> 特別パターンが優先される。マイプランを設定すると今後の予定が自動的に生成される。

- **ソース**: `src/db/schema.ts`
- **モジュール**: マイプラン

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | マイプラン ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `group_id` | text | nullable | グループ用マイプランの場合のグループ ID |
| `name` | text | NOT NULL | マイプラン名 |
| `pattern_type` | text | NOT NULL, default `basic` | `basic` (基本) / `special` (特別) |
| `valid_from` | text | nullable | 適用開始日 (`YYYY-MM-DD`) |
| `valid_until` | text | nullable | 適用終了日 (`YYYY-MM-DD`) — null なら無期限 |
| `weekly_schedule` | text (JSON) | NOT NULL, default `{}` | 週間スケジュール `{ "0": [{ startTime, endTime, title, period?, duration? }], ... }` |
| `is_active` | integer (boolean) | NOT NULL, default `true` | 有効/無効 |
| `priority` | integer | NOT NULL, default `0` | 優先度 (大きいほど優先) |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(user_id)` — `idx_myplan_user`
- INDEX: `(group_id)` — `idx_myplan_group`
- FK: `user_id` → `users.id`
