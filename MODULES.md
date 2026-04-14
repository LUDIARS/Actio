# Schedula モジュール一覧

Schedula は **プラグインベースの「予定 (Event)」 & 「タスク (Task)」管理プラットフォーム**。
JIRA のように、コアの 2 概念を中心に各種プラグインで機能を拡充する。

- **予定 (Event)**: 時間拘束のある未来の事象 (MTG, 講義, 予約等)。要件は持たない。
- **タスク (Task)**: 解決すべき現在の事象 (ToDo, Issue 等)。要件を持つが時間拘束はなく、期限のみ設定可能。

構成は **コアモジュール** (常時有効) と **プラグイン** (Event / Task / Reservation 各レジストリに登録、グループごとに有効/無効可) の二層。

---

## コアモジュール (常時有効)

コアモジュールは全ユーザ・全グループで常に利用可能。無効化できない。

| モジュール | ディレクトリ | API パス | 説明 |
|-----------|------------|----------|------|
| **認証** | `src/auth/` | `/api/auth` | ユーザ認証・Google OAuth |
| **プロフィール** | `modules/profile/` | `/api/profile` | ユーザプロフィール・プロジェクトロール |
| **グループ** | `modules/group/` | `/api/groups` | グループ管理・メンバー・モジュール選択 |
| **予定 (Event)** | `modules/event/` | `/api/events` | コア「予定」: 時間拘束のある未来の事象 |
| **タスク (Task)** | `modules/task/` | `/api/tasks` | コア「タスク」: 解決すべき現在の事象 |
| **カレンダー** | `modules/calendar/` | `/api/calendar` | Google Calendar 連携・手動予定 |
| **マイプラン** | `modules/myplan/` | `/api/myplans` | 週間ルーティーン管理 |
| **自動配置スケジューラ** | `modules/smart-scheduler/` | `/api/smart-scheduler` | DP 自動配置エンジン |
| **リマインダー** | `modules/reminder/` | `/api/reminders` | タスクリマインダー・Alexa 連携 |

### 予定 (Event) コア

`modules/event/` — 詳細は [`modules/event/PLAN.md`](modules/event/PLAN.md) を参照。

- DB テーブル: `events`
- 主要 API: `GET/POST/PUT/DELETE /api/events`, `GET /api/events/plugins`
- プラグイン登録: `registerEventPlugin()` (`src/event-plugins.ts`)
- 既存モジュール (calendar / voting / facility-booking / myplan / smart-scheduler) は将来 Event プラグインとして再分類

### タスク (Task) コア

`modules/task/` — 詳細は [`modules/task/PLAN.md`](modules/task/PLAN.md) を参照。

- DB テーブル: `tasks`
- 主要 API: `GET/POST/PUT/DELETE /api/tasks`, `GET /api/tasks/plugins`
- プラグイン登録: `registerTaskPlugin()` (`src/task-plugins.ts`)
- 既存モジュール (pm / reminder) は将来 Task プラグインとして再分類

---

## 選択式モジュール

グループの owner / leader が「使用モジュール」設定から有効/無効を切り替えできる。

### M1: CALICULA — 学校カリキュラム管理

| 項目 | 値 |
|------|-----|
| ID | `calicula` |
| ディレクトリ | `modules/schedule/` + `modules/school/` |
| API パス | `/api/school/m1` |
| カテゴリ | 教育 |
| 設計書 | [`modules/schedule/PLAN.md`](modules/schedule/PLAN.md) |

学校・教育機関向けカリキュラム管理。学科・講師・カリキュラムの CRUD、ターム単位の配置管理、データマイグレーション機能を提供。

**サブモジュール:**
- 施設予約 (`modules/school/facility-booking/`) — 教室・会議室の予約管理

### M2: PM — プロジェクト管理

| 項目 | 値 |
|------|-----|
| ID | `pm` |
| ディレクトリ | `modules/pm/` |
| API パス | `/api/pm` |
| カテゴリ | プロジェクト |
| 設計書 | [`modules/pm/PLAN.md`](modules/pm/PLAN.md) |

GitHub Issues / Notion Database と連携したプロジェクト管理。双方向タスク同期、差分検知、コンフリクト解決、クリティカルパス分析、ゴンペルツ曲線によるバグ収束予測。

### M3: MACHINA — タスク自動生成

| 項目 | 値 |
|------|-----|
| ID | `machina` |
| ディレクトリ | `modules/machina/` |
| API パス | `/api/machina` |
| カテゴリ | プロジェクト |
| 設計書 | [`modules/machina/PLAN.md`](modules/machina/PLAN.md) |

Slack / Discord チャンネル監視 & AI タスク自動生成。ルールベース + Claude Haiku 解析のハイブリッド。M2 (PM) へのリレー機能で自動生成タスクをプロジェクト管理に連携。

### 通知・Webhook

| 項目 | 値 |
|------|-----|
| ID | `notification` |
| ディレクトリ | `modules/notification/` |
| API パス | `/api/webhooks` |
| カテゴリ | コミュニケーション |
| 設計書 | [`modules/notification/PLAN.md`](modules/notification/PLAN.md) |

Slack / Discord / LINE / 汎用 Webhook 通知。イベントバス駆動でモジュール横断の通知配信。テンプレートエンジン、クワイエットアワー、配信ログ。

### 日程調整 Voting

| 項目 | 値 |
|------|-----|
| ID | `voting` |
| ディレクトリ | `modules/voting/` |
| API パス | `/api/voting` |
| カテゴリ | コミュニケーション |
| 設計書 | [`modules/voting/PLAN.md`](modules/voting/PLAN.md) |

○△× 投票による日程調整。カレンダー空き状況に基づく自動回答生成。予約プラグインシステム対応。

### 休日管理

| 項目 | 値 |
|------|-----|
| ID | `holiday` |
| ディレクトリ | `modules/holiday/` |
| API パス | `/api/holidays` |
| カテゴリ | ユーティリティ |
| 設計書 | [`modules/holiday/PLAN.md`](modules/holiday/PLAN.md) |

日本の祝日自動計算 (ルールベース)、DB 同期、グループ固有の休日・審査会期間管理。スケジューラ向け営業日判定ユーティリティ。

### 施設予約

| 項目 | 値 |
|------|-----|
| ID | `facility-booking` |
| ディレクトリ | `modules/school/facility-booking/` |
| API パス | `/api/school/facility-booking` |
| カテゴリ | 教育 |
| 設計書 | [`modules/school/facility-booking/PLAN.md`](modules/school/facility-booking/PLAN.md) |

教室・会議室の予約管理。予約時にカレンダー予定を自動登録、キャンセル時に連動削除。授業スケジュールとの競合検出。

### 外部サービス連携

| 項目 | 値 |
|------|-----|
| ID | `integrations` |
| ディレクトリ | `modules/integrations/` |
| API パス | `/api/integrations` |
| カテゴリ | ユーティリティ |
| 設計書 | [`modules/integrations/PLAN.md`](modules/integrations/PLAN.md) |

Google Calendar 双方向同期、Notion Database 連携。

---

## モジュール依存関係

Schedula はコアの **Event / Task** を中心に、各種モジュールがプラグインとして連携する。

```
              ┌──────────────────────────────────┐
              │           Groups (コア)          │
              └──────────────┬───────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │                             │
       ┌──────▼──────┐               ┌──────▼──────┐
       │  Event コア │               │  Task コア  │
       │ /api/events │               │ /api/tasks  │
       └──────┬──────┘               └──────┬──────┘
              │                             │
   ┌──────────┼──────────┬───────┐    ┌─────┴──────┐
   │          │          │       │    │            │
┌──▼───┐ ┌────▼────┐ ┌───▼───┐ ┌▼──┐ ┌▼──┐  ┌─────▼─────┐
│Cal-  │ │Facility │ │Voting │ │My-│ │PM │  │ Reminder  │
│endar │ │Booking  │ │       │ │Pl-│ │   │  │           │
│      │ │         │ │       │ │an │ │   │  │           │
└──────┘ └─────────┘ └───────┘ └───┘ └───┘  └───────────┘

   (Event プラグイン候補)         (Task プラグイン候補)

┌────────────┐     ┌────────────┐     ┌────────────┐
│ CALICULA   │     │ Notifica-  │     │ Holiday    │
│ (M1)       │     │ tion       │     │            │
└────────────┘     └────────────┘     └────────────┘

(独立モジュール: 横断的補助機能)
```

---

## グループのモジュール選択

グループ設定画面 (`/groups`) の「使用モジュール」パネルから、グループで有効にするモジュールを選択できる。

- **権限**: owner / leader のみ変更可能
- **デフォルト**: holiday, voting, notification
- **保存先**: `groups.enabledModules` (JSON 配列)

新しいグループ作成時は `DEFAULT_ENABLED_MODULES` が適用される。
