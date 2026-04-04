# Holiday DBスキーマ

## holidays テーブル

休日・休業期間。スキーマファイル: `src/db/schema.ts`

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 休日 ID |
| groupId | text | グループ ID (nullable: null=システム全体) |
| name | text | 休日名 |
| date | text | 開始日 (YYYY-MM-DD) |
| endDate | text | 終了日 (nullable: 単日なら date と同じ) |
| holidayType | text | `national_holiday` / `school_holiday` / `examination_period` / `custom` |
| recurrence | text | `none` / `yearly` |
| source | text | 自動取得ソース (nullable: 手動なら null) |
| createdBy | text | 作成者 |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: groupId, date, holidayType
