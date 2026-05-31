# M1: 施設予約 DBスキーマ

## reservations テーブル

施設予約データ。スキーマファイル: `src/db/schema.ts`

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 予約 ID |
| groupId | text (FK → groups.id) | グループ ID |
| title | text | タイトル |
| day | integer | 曜日 |
| period | integer | コマ |
| roomId | text (FK → rooms.id) | 教室 ID |
| createdBy | text | 作成者 |
| participants | text (JSON) | 参加者ユーザー ID 配列 |
| status | text | `pending` / `confirmed` / `cancelled` |
| note | text | メモ |
| version | integer | 楽観的ロック用バージョン (default: 1) |
| calendarEventId | text | 連携先カレンダー予定 ID (nullable) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**INDEX**: (roomId, day, period), groupId
