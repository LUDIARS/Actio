# holidays

> 休日・休業期間。グループ単位、またはシステム全体で管理。
> 日本の祝日や審査会期間など。

- **ソース**: `src/db/schema.ts`
- **モジュール**: 休日管理

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | 休日 ID |
| `group_id` | text | nullable | グループ ID (null ならシステム全体) |
| `name` | text | NOT NULL | 休日名 (例: "元日", "審査会期間", "春休み") |
| `date` | text | NOT NULL | 開始日 (`YYYY-MM-DD`) |
| `end_date` | text | nullable | 終了日 (`YYYY-MM-DD`) ※ 期間の場合 |
| `holiday_type` | text | NOT NULL, default `custom` | `national_holiday` / `school_holiday` / `examination_period` / `custom` |
| `recurrence` | text | NOT NULL, default `none` | `none` (単発) / `yearly` (毎年) |
| `source` | text | nullable | 自動取得ソース (例: `japanese_holidays`) — 手動なら null |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(group_id)` — `idx_holiday_group`
- INDEX: `(date)` — `idx_holiday_date`
- INDEX: `(holiday_type)` — `idx_holiday_type`
