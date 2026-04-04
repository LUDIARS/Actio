# MACHINA DBスキーマ

スキーマファイル: `src/db/schema.ts`

## machinaChannelMonitors テーブル

チャンネル監視設定。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| groupId | text (FK → groups.id) | グループ ID |
| platform | text | `slack` / `discord` |
| channelId | text | チャンネル ID |
| channelName | text | チャンネル名（表示用） |
| webhookEndpointId | text | Webhook エンドポイント ID (nullable) |
| isActive | integer (boolean) | 有効/無効 (default: true) |
| createdBy | text | 作成者 |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**UNIQUE**: (groupId, platform, channelId)
**INDEX**: groupId

## machinaTasks テーブル

自動生成されたタスク。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | タスク ID |
| groupId | text (FK → groups.id) | グループ ID |
| title | text | タスクタイトル |
| description | text | 詳細 (nullable) |
| status | text | `pending` / `in_progress` / `done` / `cancelled` |
| priority | text | `low` / `medium` / `high` / `critical` |
| assigneeId | text | アサイン先ユーザー ID (nullable) |
| dueDate | text | 納期 (nullable) |
| source | text | `auto` / `command` / `manual` |
| sourcePlatform | text | `slack` / `discord` / `manual` (nullable) |
| sourceMessageId | text | 元メッセージ ID (nullable) |
| sourceChannelId | text | 元チャンネル ID (nullable) |
| sourceText | text | 解析元テキスト (nullable) |
| confidence | integer | AI 信頼度 (0-100, default: 0) |
| isCriticalPath | integer (boolean) | クリティカルパスか (default: false) |
| relayedToPm | integer (boolean) | PM リレー済みか (default: false) |
| pmTaskId | text | PM タスク ID (nullable) |
| createdBy | text | 作成者 |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**INDEX**: groupId, status, assigneeId, dueDate, priority

## machinaTaskLogs テーブル

タスク変更履歴。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| taskId | text (FK → machinaTasks.id) | タスク ID |
| action | text | `created` / `updated` / `assigned` / `status_changed` / `priority_changed` / `relayed` |
| previousValue | text | 変更前の値 (nullable) |
| newValue | text | 変更後の値 (nullable) |
| reason | text | 変更理由 (nullable) |
| triggerMessageId | text | トリガー元メッセージ ID (nullable) |
| performedBy | text | 実行者 (`system` / userId) |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: taskId
