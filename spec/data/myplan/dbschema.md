# MyPlan DBスキーマ

## myPlans テーブル

週間ルーティーン定義。基本パターンと特別パターンを管理。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | マイプラン ID |
| userId | text (FK → users.id) | ユーザー ID |
| groupId | text | グループ ID (nullable: グループ用の場合) |
| name | text | プラン名 |
| patternType | text | `basic` / `special` |
| validFrom | text | 適用開始日 YYYY-MM-DD (nullable) |
| validUntil | text | 適用終了日 YYYY-MM-DD (nullable: 無期限) |
| weeklySchedule | text (JSON) | 週間スケジュール `{ "曜日": [{ startTime, endTime, title }] }` |
| isActive | integer (boolean) | 有効/無効 (default: true) |
| priority | integer | 優先度 (大きいほど優先, default: 0) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**INDEX**: userId, groupId

## plans テーブル（レガシー）

コマベースの繰り返し予定生成。myPlans が推奨だが併用可能。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | プラン ID |
| userId | text (FK → users.id) | ユーザー ID |
| name | text | プラン名 |
| description | text | 説明 (nullable) |
| days | text (JSON) | 対象曜日配列 `[0,1,2,...]` |
| startPeriod | integer | 開始コマ (0-10) |
| duration | integer | コマ数 (default: 1) |
| eventType | text | イベント種別 (default: `personal`) |
| isPrivate | integer (boolean) | 非公開フラグ (default: true) |
| isActive | integer (boolean) | 有効/無効 (default: true) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**INDEX**: userId
