# PM DBスキーマ

スキーマファイル: `src/db/pm-schema.ts`

## pmProjects テーブル

プロジェクト（外部ソース接続設定）。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | プロジェクト ID |
| name | text | プロジェクト名 |
| source | text | `github` / `notion` |
| sourceConfig | text (JSON) | 接続設定 (owner, repo, token 等) |
| syncIntervalMinutes | integer | 同期間隔 (default: 15) |
| lastSyncedAt | text | 最終同期日時 (nullable) |
| ownerId | text | 所有者ユーザー ID |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**INDEX**: ownerId

## pmTasks テーブル

外部ソースから同期されたタスク。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | タスク ID |
| projectId | text | プロジェクト ID |
| externalId | text | 外部 ID |
| externalUrl | text | 外部 URL (nullable) |
| title | text | タイトル |
| description | text | 説明 (nullable) |
| status | text | `open` / `in_progress` / `review` / `closed` |
| priority | text | `low` / `medium` / `high` / `critical` |
| assignees | text (JSON) | 担当者リスト |
| labels | text (JSON) | ラベルリスト |
| dueDate | text | 期限 (nullable) |
| milestoneExternalId | text | マイルストーン外部 ID (nullable) |
| milestoneName | text | マイルストーン名 (nullable) |
| estimatedHours | real | 見積もり時間 (nullable) |
| blockedBy | text (JSON) | 依存タスク ID リスト |
| descriptionHash | text | 説明ハッシュ (nullable) |
| dirtyFlag | integer | ローカル変更フラグ (default: 0) |
| localUpdatedAt | text | ローカル更新日時 (nullable) |
| externalUpdatedAt | text | 外部更新日時 (nullable) |
| lastSyncedAt | text | 最終同期日時 (nullable) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**INDEX**: projectId, status, dueDate, dirtyFlag

## pmTaskSnapshots テーブル

タスクの変更履歴。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| taskId | text | タスク ID |
| changeType | text | `created` / `updated` / `closed` / `reopened` |
| changedFields | text (JSON) | 変更フィールド (before/after) |
| snapshotData | text (JSON) | 変更時点の全データ |
| detectedAt | text | 検出日時 |

**INDEX**: taskId

## pmMilestones テーブル

外部マイルストーン。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| projectId | text | プロジェクト ID |
| externalId | text | 外部 ID |
| title | text | タイトル |
| description | text | 説明 (nullable) |
| dueDate | text | 期限 (nullable) |
| state | text | `open` / `closed` |
| externalUpdatedAt | text | 外部更新日時 (nullable) |
| createdAt | integer (timestamp) | 作成日時 |
| updatedAt | integer (timestamp) | 更新日時 |

**INDEX**: projectId

## pmTaskValidations テーブル

タスク内容の検証結果。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| taskId | text | タスク ID |
| score | integer | 充実度スコア (default: 0) |
| issues | text (JSON) | 問題リスト `[{ type, message, severity }]` |
| suggestions | text (JSON) | 改善提案リスト |
| relatedCommits | text (JSON) | 関連コミット情報 |
| testFiles | text (JSON) | 対応テストファイル |
| validatedAt | text | 検証日時 |

**INDEX**: taskId

## pmConflicts テーブル

同期コンフリクト。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| taskId | text | タスク ID |
| projectId | text | プロジェクト ID |
| localVersion | text (JSON) | ローカル版スナップショット |
| externalVersion | text (JSON) | 外部版スナップショット |
| baseVersion | text (JSON) | 前回同期版スナップショット |
| resolution | text | 解決戦略 |
| resolvedData | text (JSON) | マージ結果 (nullable) |
| status | text | `pending` / `resolved` / `failed` |
| createdAt | text | 作成日時 |
| resolvedAt | text | 解決日時 (nullable) |

**INDEX**: projectId, status

## pmAnalyticsCache テーブル

分析レポートキャッシュ。

| カラム | 型 | 説明 |
|--------|-----|------|
| id | text (PK) | ID |
| projectId | text | プロジェクト ID |
| reportType | text | `progress` / `critical_path` / `gompertz` |
| data | text (JSON) | レポートデータ |
| generatedAt | text | 生成日時 |
| expiresAt | text | 有効期限 |

**INDEX**: (projectId, reportType)
