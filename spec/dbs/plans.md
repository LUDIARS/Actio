# plans

> 繰り返し予定の生成元プラン。プランを設定すると対応する `personal_events` が自動生成される。

- **ソース**: `src/db/schema.ts`
- **モジュール**: カレンダー / プラン

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | プラン ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `name` | text | NOT NULL | プラン名 |
| `description` | text | nullable | 説明 |
| `days` | text (JSON `number[]`) | NOT NULL, default `[]` | 繰り返し対象曜日 (0=月) |
| `start_period` | integer | NOT NULL | 開始コマ (0-10) |
| `duration` | integer | NOT NULL, default `1` | コマ数 |
| `event_type` | text | NOT NULL, default `personal` | イベント種別 |
| `is_private` | integer (boolean) | NOT NULL, default `true` | 非公開フラグ |
| `is_active` | integer (boolean) | NOT NULL, default `true` | プラン有効/無効 |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(user_id)` — `idx_plan_user`
- FK: `user_id` → `users.id`
