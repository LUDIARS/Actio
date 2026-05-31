# group_schedules

> グループの曜日ベース繰り返し予定。
> グループの予定は削除不可 (個人の予定のみ個別に追加・削除可能)。
> ターム/期間ラベル単位で再配置時に削除・再登録する。

- **ソース**: `src/db/schema.ts`
- **モジュール**: グループ

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `title` | text | NOT NULL | タイトル |
| `description` | text | nullable | 説明 |
| `day` | integer | NOT NULL | 曜日 (0=月 〜 6=日) |
| `period` | integer | NOT NULL | コマ (0-10) |
| `duration` | integer | NOT NULL, default `1` | コマ数 |
| `date` | text | nullable | 特定日付 (`YYYY-MM-DD`) ※ `oneshot` の場合 |
| `schedule_type` | text | NOT NULL, default `recurring` | `recurring` / `oneshot` |
| `label` | text | nullable | ターム/期間ラベル (例: "2026前期") |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(group_id)` — `idx_group_schedule_group`
- INDEX: `(date)` — `idx_group_schedule_date`
- INDEX: `(label)` — `idx_group_schedule_label`
- FK: `group_id` → `groups.id`
