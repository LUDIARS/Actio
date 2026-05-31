# Notification DBスキーマ

スキーマファイル: `src/db/schema.ts`

## webhookEndpoints テーブル

Webhook エンドポイント設定。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | エンドポイント ID |
| url | text | Webhook URL |
| events | text (JSON) | 対象イベント名配列 |
| secret | text | HMAC 署名用シークレット |
| platform | text | `generic` / `slack` / `discord` / `line` |
| sendMethod | text | `webhook` / `bot` |
| botToken | text | Bot トークン (nullable) |
| channelId | text | チャンネル ID (nullable) |
| isActive | integer (boolean) | 有効/無効 (default: true) |
| createdBy | text | 作成者 |
| failCount | integer | 連続失敗回数 (default: 0) |
| lastDeliveredAt | integer (timestamp) | 最終配信日時 (nullable) |
| createdAt | integer (timestamp) | 作成日時 |

## notificationTemplates テーブル

通知テンプレート。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | テンプレート ID |
| event | text | イベント名 (`*` = デフォルト) |
| platform | text | `generic` / `slack` / `discord` / `line` / `all` |
| title | text | タイトルテンプレート |
| body | text | 本文テンプレート |
| useCodeBlock | integer (boolean) | コードブロック使用 (default: false) |
| codeBlockLang | text | コードブロック言語 (nullable) |
| isDefault | integer (boolean) | システムデフォルトか (default: false) |
| createdBy | text | 作成者 |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

## webhookDeliveryLogs テーブル

Webhook 配信ログ。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| webhookId | text (FK → webhookEndpoints.id) | エンドポイント ID |
| deliveryId | text | 配信 ID |
| event | text | イベント名 |
| statusCode | integer | HTTP ステータスコード (nullable) |
| success | integer (boolean) | 成功/失敗 |
| retryCount | integer | リトライ回数 (default: 0) |
| latencyMs | integer | レイテンシ (default: 0) |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: webhookId

## notificationPreferences テーブル

ユーザーの通知設定。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| userId | text | ユーザー ID |
| channel | text | チャンネル名 |
| enabledEvents | text (JSON) | 有効イベント名配列 |
| reminderDayBefore | integer (boolean) | 前日リマインダー (default: true) |
| reminderDayBeforeTime | text | 前日リマインダー時刻 (default: 18:00) |
| reminderMorningOf | integer (boolean) | 当日朝リマインダー (default: true) |
| reminderMorningOfTime | text | 当日朝リマインダー時刻 (default: 08:00) |
| reminderBefore | integer (boolean) | 直前リマインダー (default: true) |
| reminderBeforeMinutes | integer | 直前何分前 (default: 15) |
| quietHoursStart | text | quiet hours 開始 (default: 22:00) |
| quietHoursEnd | text | quiet hours 終了 (default: 07:00) |

**UNIQUE**: (userId, channel)

## notifications テーブル

配信済み通知。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| userId | text | ユーザー ID |
| event | text | イベント名 |
| channel | text | チャンネル名 |
| title | text | タイトル |
| body | text | 本文 |
| isRead | integer (boolean) | 既読/未読 (default: false) |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: userId
