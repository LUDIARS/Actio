# personal_events

> 個人予定 (手動・プラン生成・外部同期)。
> Google 認証なしでも手動で予定を追加可能。

- **ソース**: `src/db/schema.ts`
- **モジュール**: カレンダー

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | イベント ID |
| `user_id` | text | NOT NULL, FK → `users.id` | ユーザー ID |
| `title` | text | NOT NULL | タイトル |
| `description` | text | nullable | 説明 |
| `day` | integer | NOT NULL | 曜日 (0=月 〜 6=日) |
| `period` | integer | NOT NULL | コマ (0-10、レガシー互換) |
| `duration` | integer | NOT NULL, default `1` | コマ数 (複数コマ対応) |
| `start_time` | text | nullable | 開始時刻 (`HH:MM`) — 時間ベーススケジュール用 |
| `end_time` | text | nullable | 終了時刻 (`HH:MM`) — 時間ベーススケジュール用 |
| `event_type` | text | NOT NULL, default `personal` | `personal` / `school_event` |
| `plan_id` | text | nullable | 繰り返し元のプラン ID (プラン自動生成の場合) |
| `is_private` | integer (boolean) | NOT NULL, default `true` | 非公開フラグ |
| `google_calendar_event_id` | text | nullable | Google Calendar 同期時のイベント ID |
| `notion_page_id` | text | nullable | Notion 同期時のページ ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(user_id, day, period)` — `unique_personal_slot`
- INDEX: `(user_id)` — `idx_personal_event_user`
- INDEX: `(plan_id)` — `idx_personal_event_plan`
- FK: `user_id` → `users.id`
