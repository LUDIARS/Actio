# DB スキーマ一覧 (dblist)

> Schedula のデータベースに登録されている全テーブルのリスト。
> 各テーブルの詳細スキーマは [`dbs/`](dbs/) 配下のファイルにまとめている。
>
> このファイルおよび `dbs/` 配下のファイルは `/db-schema-docs` スラッシュコマンド (または
> `db-schema-docs` スキル) で再生成できる。スキーマ (`src/db/schema.ts`,
> `src/db/curriculum-schema.ts`, `src/db/pm-schema.ts`) を変更したら必ず再生成すること。

## ソースファイル

| ソース | 用途 |
|--------|------|
| `src/db/schema.ts` | メインスキーマ (認証・グループ・カレンダー・通知・予約 など) |
| `src/db/curriculum-schema.ts` | M1 カリキュラム関連 |
| `src/db/pm-schema.ts` | M2 PM (プロジェクト管理) 関連 |

## テーブル一覧

### 認証・ユーザー (`src/db/schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `users` | ユーザー基本情報・パスワード/Google OAuth 認証データ | [users.md](dbs/users.md) |
| `sessions` | JWT リフレッシュトークン管理 | [sessions.md](dbs/sessions.md) |
| `user_profiles` | ユーザー自己紹介・表示名・アバター | [user_profiles.md](dbs/user_profiles.md) |
| `user_project_roles` | ユーザーごとのプロジェクト別業務ロール | [user_project_roles.md](dbs/user_project_roles.md) |
| `api_clients` | 外部 API 連携用クライアント認証情報 | [api_clients.md](dbs/api_clients.md) |

### グループ (`src/db/schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `groups` | グループ定義 (有効モジュール情報を含む) | [groups.md](dbs/groups.md) |
| `group_members` | グループメンバーシップ (多対多) | [group_members.md](dbs/group_members.md) |
| `group_schedules` | グループの曜日ベース繰り返し予定 | [group_schedules.md](dbs/group_schedules.md) |
| `group_events` | グループの日付ベース個別予定 (行事/休日 など) | [group_events.md](dbs/group_events.md) |

### カレンダー・プラン (`src/db/schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `personal_events` | 個人予定 (手動・プラン生成・外部同期) | [personal_events.md](dbs/personal_events.md) |
| `plans` | 繰り返し予定の生成元プラン | [plans.md](dbs/plans.md) |
| `my_plans` | 週間ルーティーン (基本/特別パターン) | [my_plans.md](dbs/my_plans.md) |
| `integration_settings` | Google Calendar / Notion 等の連携設定 | [integration_settings.md](dbs/integration_settings.md) |
| `sync_logs` | 外部サービス同期ログ | [sync_logs.md](dbs/sync_logs.md) |
| `reminders` | リマインダー (Web / API / Alexa) | [reminders.md](dbs/reminders.md) |

### スマートスケジューラ (`src/db/schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `scheduling_tasks` | 自動配置対象のタスク | [scheduling_tasks.md](dbs/scheduling_tasks.md) |
| `scheduling_results` | 自動配置結果 (draft/confirmed) | [scheduling_results.md](dbs/scheduling_results.md) |

### M1: 教室・スケジュール (`src/db/schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `rooms` | 教室・会議室マスタ | [rooms.md](dbs/rooms.md) |
| `schedule_entries` | 確定された実スケジュール (タームベース) | [schedule_entries.md](dbs/schedule_entries.md) |
| `reservations` | 教室予約 | [reservations.md](dbs/reservations.md) |

### M1: カリキュラム (`src/db/curriculum-schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `departments` | 学科マスタ | [departments.md](dbs/departments.md) |
| `instructors` | 講師マスタ | [instructors.md](dbs/instructors.md) |
| `curricula` | カリキュラム (学科 × 講師) | [curricula.md](dbs/curricula.md) |
| `curriculum_departments` | カリキュラム × 学科 中間テーブル (合同授業対応) | [curriculum_departments.md](dbs/curriculum_departments.md) |
| `terms` | ターム (期間区分) | [terms.md](dbs/terms.md) |
| `curriculum_placements` | カリキュラム時間割配置 | [curriculum_placements.md](dbs/curriculum_placements.md) |
| `instructor_available_slots` | 講師の出講可能曜日・コマ | [instructor_available_slots.md](dbs/instructor_available_slots.md) |

### M2: PM (`src/db/pm-schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `pm_projects` | PM プロジェクト (GitHub/Notion 接続) | [pm_projects.md](dbs/pm_projects.md) |
| `pm_tasks` | 同期されたタスク | [pm_tasks.md](dbs/pm_tasks.md) |
| `pm_task_snapshots` | タスク変更履歴スナップショット | [pm_task_snapshots.md](dbs/pm_task_snapshots.md) |
| `pm_milestones` | 外部マイルストーン | [pm_milestones.md](dbs/pm_milestones.md) |
| `pm_task_validations` | タスク内容検証結果 (スコア・改善提案) | [pm_task_validations.md](dbs/pm_task_validations.md) |
| `pm_conflicts` | 双方向同期コンフリクト | [pm_conflicts.md](dbs/pm_conflicts.md) |
| `pm_analytics_cache` | 分析レポートキャッシュ | [pm_analytics_cache.md](dbs/pm_analytics_cache.md) |

### M3: MACHINA (旧モジュール / `src/db/schema.ts`)

> バックエンドは Discutere リポジトリに分離済み。テーブルは互換目的で残存。

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `machina_channel_monitors` | Slack/Discord チャンネル監視設定 | [machina_channel_monitors.md](dbs/machina_channel_monitors.md) |
| `machina_tasks` | チャットログから自動生成されたタスク | [machina_tasks.md](dbs/machina_tasks.md) |
| `machina_task_logs` | MACHINA タスク変更履歴 | [machina_task_logs.md](dbs/machina_task_logs.md) |

### M5: 通知 (`src/db/schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `webhook_endpoints` | Webhook / Bot 配信先設定 | [webhook_endpoints.md](dbs/webhook_endpoints.md) |
| `notification_templates` | イベント別通知テンプレート | [notification_templates.md](dbs/notification_templates.md) |
| `webhook_delivery_logs` | Webhook 配信ログ | [webhook_delivery_logs.md](dbs/webhook_delivery_logs.md) |
| `notification_preferences` | ユーザー別通知設定 (リマインダー時刻 など) | [notification_preferences.md](dbs/notification_preferences.md) |
| `notifications` | アプリ内通知 (受信箱) | [notifications.md](dbs/notifications.md) |

### M6: Voting (`src/db/schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `voting_events` | 日程調整イベント | [voting_events.md](dbs/voting_events.md) |
| `voting_candidates` | 候補日時 | [voting_candidates.md](dbs/voting_candidates.md) |
| `votes` | 回答 | [votes.md](dbs/votes.md) |

### 休日・運用 (`src/db/schema.ts`)

| テーブル | 概要 | スキーマ |
|---------|------|---------|
| `holidays` | 祝日・休業期間 (グループ別/全体) | [holidays.md](dbs/holidays.md) |
| `app_settings` | アプリ全体設定 (key-value) | [app_settings.md](dbs/app_settings.md) |

## テーブル数集計

| カテゴリ | 件数 |
|---------|------|
| 認証・ユーザー | 5 |
| グループ | 4 |
| カレンダー・プラン | 6 |
| スマートスケジューラ | 2 |
| M1: 教室・スケジュール | 3 |
| M1: カリキュラム | 7 |
| M2: PM | 7 |
| M3: MACHINA (旧) | 3 |
| M5: 通知 | 5 |
| M6: Voting | 3 |
| 休日・運用 | 2 |
| **合計** | **47** |
