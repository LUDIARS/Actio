# group_events

> グループ単位の特定日のイベント (学校行事・試験・休校日 など)。
> `group_schedules` は曜日ベースの繰り返し予定だが、こちらは日付ベースの個別予定。

- **ソース**: `src/db/schema.ts`
- **モジュール**: グループ / 休日

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `title` | text | NOT NULL | タイトル |
| `description` | text | nullable | 説明 |
| `date` | text | NOT NULL | 開始日 (`YYYY-MM-DD`) |
| `end_date` | text | nullable | 終了日 (`YYYY-MM-DD`) ※ 複数日にまたがる場合 |
| `all_day` | integer (boolean) | NOT NULL, default `true` | 終日イベントか |
| `period` | integer | nullable | 時限 (終日でない場合) |
| `duration` | integer | nullable, default `1` | コマ数 (終日でない場合) |
| `event_type` | text | NOT NULL, default `event` | `event` / `holiday` / `examination_period` / `custom` |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(group_id)` — `idx_group_event_group`
- INDEX: `(date)` — `idx_group_event_date`
- FK: `group_id` → `groups.id`
