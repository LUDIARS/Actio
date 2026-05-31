# Calendar DBスキーマ

## personalEvents テーブル

手動登録された個人予定。Google Calendar 同期やプランからの自動生成にも使用。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | イベント ID |
| userId | text (FK → users.id) | ユーザー ID |
| title | text | タイトル |
| description | text | 説明 (nullable) |
| day | integer | 曜日 (0=月〜6=日) |
| period | integer | コマ (0-10) |
| duration | integer | コマ数 (default: 1) |
| startTime | text | 開始時刻 HH:MM (nullable) |
| endTime | text | 終了時刻 HH:MM (nullable) |
| eventType | text | `personal` / `school_event` |
| planId | text | 生成元プラン ID (nullable) |
| isPrivate | integer (boolean) | 非公開フラグ (default: true) |
| googleCalendarEventId | text | Google Calendar 同期用 ID (nullable) |
| notionPageId | text | Notion 同期用 ID (nullable) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**UNIQUE**: (userId, day, period)
**INDEX**: userId, planId

## integrationSettings テーブル

外部サービス（Google Calendar / Notion）の連携トークン・設定。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| userId | text (FK → users.id) | ユーザー ID |
| service | text | サービス種別 (`google_calendar` / `notion`) |
| accessToken | text | アクセストークン (nullable) |
| refreshToken | text | リフレッシュトークン (nullable) |
| tokenExpiresAt | integer | トークン有効期限 (nullable) |
| config | text (JSON) | サービス固有設定 |
| isActive | integer (boolean) | 有効/無効 (default: true) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**UNIQUE**: (userId, service)

## syncLogs テーブル

外部サービスとの同期結果ログ。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| userId | text (FK → users.id) | ユーザー ID |
| service | text | サービス種別 |
| action | text | `sync_push` / `sync_pull` / `create` / `update` / `delete` |
| localEventId | text | ローカルイベント ID (nullable) |
| externalId | text | 外部サービス ID (nullable) |
| status | text | `success` / `error` |
| errorMessage | text | エラーメッセージ (nullable) |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: userId, service
