# reservations

> 教室予約。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M1 / 施設予約

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 予約 ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `title` | text | NOT NULL | タイトル |
| `day` | integer | NOT NULL | 曜日 (0=月 〜 6=日) |
| `period` | integer | NOT NULL | コマ |
| `room_id` | text | NOT NULL, FK → `rooms.id` | 教室 ID |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `participants` | text (JSON `string[]`) | NOT NULL, default `[]` | 参加者ユーザー ID 配列 |
| `status` | text | NOT NULL, default `pending` | 予約ステータス |
| `note` | text | NOT NULL, default `""` | 備考 |
| `version` | integer | NOT NULL, default `1` | バージョン (楽観的ロック用) |
| `calendar_event_id` | text | nullable | 連携先カレンダー予定 ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(room_id, day, period)` — `idx_reservation_room_slot`
- INDEX: `(group_id)` — `idx_reservation_group`
- FK: `group_id` → `groups.id`, `room_id` → `rooms.id`
