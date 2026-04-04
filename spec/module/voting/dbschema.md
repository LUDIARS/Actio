# Voting DBスキーマ

スキーマファイル: `src/db/schema.ts`

## votingEvents テーブル

日程調整イベント。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | イベント ID |
| title | text | タイトル |
| description | text | 説明 |
| createdBy | text (FK → users.id) | 作成者 |
| deadline | text | 回答期限 ISO 8601 (nullable) |
| status | text | `open` / `closed` |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

## votingCandidates テーブル

候補日時。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 候補 ID |
| eventId | text (FK → votingEvents.id) | イベント ID |
| label | text | 候補ラベル (例: "3/20(木) 10:00〜11:00") |
| sortOrder | integer | ソート順 (default: 0) |

**INDEX**: eventId

## votes テーブル

投票回答。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 回答 ID |
| eventId | text (FK → votingEvents.id) | イベント ID |
| candidateId | text (FK → votingCandidates.id) | 候補 ID |
| userId | text (FK → users.id) | 回答者 |
| answer | text | `ok` (○) / `maybe` (△) / `ng` (×) |
| isAutoReply | integer (boolean) | 自動回答か (default: false) |
| comment | text | コメント |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**UNIQUE**: (eventId, candidateId, userId)
**INDEX**: eventId, userId
