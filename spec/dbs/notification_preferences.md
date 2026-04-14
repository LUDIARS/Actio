# notification_preferences

> ユーザー別通知設定 (リマインダー時刻・サイレント時間 など)。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M5 / 通知

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `user_id` | text | NOT NULL | ユーザー ID |
| `channel` | text | NOT NULL | 配信チャンネル |
| `enabled_events` | text (JSON `string[]`) | NOT NULL, default `[]` | 有効イベント名配列 |
| `reminder_day_before` | integer (boolean) | NOT NULL, default `true` | 前日リマインダー有効 |
| `reminder_day_before_time` | text | NOT NULL, default `18:00` | 前日リマインダー時刻 |
| `reminder_morning_of` | integer (boolean) | NOT NULL, default `true` | 当日朝リマインダー有効 |
| `reminder_morning_of_time` | text | NOT NULL, default `08:00` | 当日朝リマインダー時刻 |
| `reminder_before` | integer (boolean) | NOT NULL, default `true` | 直前リマインダー有効 |
| `reminder_before_minutes` | integer | NOT NULL, default `15` | 直前リマインダー (分前) |
| `quiet_hours_start` | text | NOT NULL, default `22:00` | サイレント時間開始 |
| `quiet_hours_end` | text | NOT NULL, default `07:00` | サイレント時間終了 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(user_id, channel)` — `unique_user_channel`
