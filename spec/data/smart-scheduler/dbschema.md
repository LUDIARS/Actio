# Smart Scheduler DBスキーマ

## schedulingTasks テーブル

自動配置対象のスケジューリングタスク。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | タスク ID |
| groupId | text (FK → groups.id) | グループ ID |
| title | text | タスク名 |
| duration | integer | 所要コマ数 (default: 1) |
| priority | integer | 優先度 (大きいほど優先, default: 0) |
| preferredDays | text (JSON) | 希望曜日配列 (空=任意) |
| preferredPeriods | text (JSON) | 希望コマ配列 (空=任意) |
| instructorId | text | 担当講師 ID (nullable) |
| status | text | `pending` / `placed` / `failed` |
| createdBy | text | 作成者 |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**INDEX**: groupId, status

## schedulingResults テーブル

DP ソルバーの配置結果。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | 結果 ID |
| groupId | text (FK → groups.id) | グループ ID |
| status | text | `draft` / `confirmed` / `rejected` |
| placements | text (JSON) | 配置結果配列 `[{ taskId, title, day, period, duration, score }]` |
| totalScore | integer | 合計スコア (default: 0) |
| createdBy | text | 作成者 |
| createdAt | integer (timestamp) | 作成日時 |

**INDEX**: groupId
