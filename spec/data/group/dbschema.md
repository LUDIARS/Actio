# Group DBスキーマ

## groups テーブル

グループの基本情報。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | グループ ID |
| name | text | グループ名 |
| description | text | 説明 (nullable) |
| enabledModules | text | 有効化モジュール一覧 (nullable) |
| createdBy | text | 作成者ユーザー ID |
| createdAt | integer (timestamp) | 作成日時 |

## groupMembers テーブル

グループとユーザーの多対多関係。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| groupId | text (FK → groups.id) | グループ ID |
| userId | text (FK → users.id) | ユーザー ID |
| role | text | ロール (`owner` / `admin` / `member`) |
| joinedAt | integer (timestamp) | 参加日時 |

**UNIQUE**: (groupId, userId)
**INDEX**: userId, groupId

## groupSchedules テーブル

曜日ベースのグループ予定。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| groupId | text (FK → groups.id) | グループ ID |
| title | text | タイトル |
| description | text | 説明 (nullable) |
| day | integer | 曜日 (0=月〜6=日) |
| period | integer | コマ (0-10) |
| duration | integer | コマ数 (default: 1) |
| date | text | 特定日付 (nullable, YYYY-MM-DD) |
| scheduleType | text | `recurring` / `oneshot` |
| label | text | ターム・期間ラベル (nullable) |
| createdBy | text | 作成者 |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: groupId, date, label

## groupEvents テーブル

日付ベースのグループ個別予定。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| groupId | text (FK → groups.id) | グループ ID |
| title | text | タイトル |
| description | text | 説明 (nullable) |
| date | text | 日付 (YYYY-MM-DD) |
| endDate | text | 終了日 (nullable) |
| allDay | integer (boolean) | 終日イベントか (default: true) |
| period | integer | 時限 (nullable) |
| duration | integer | コマ数 (nullable, default: 1) |
| eventType | text | `event` / `holiday` / `examination_period` / `custom` |
| createdBy | text | 作成者 |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: groupId, date
