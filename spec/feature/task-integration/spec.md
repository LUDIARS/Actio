---
title: "タスク連携の拡張 — 通知の外部化・スプリント表示・人間/AI 担当・クリティカルパス・Cc プロジェクト連携"
status: design
owner: Actio
related:
  - spec/feature/team-task/spec.md
  - spec/feature/backlog-planning.md
  - Concordia spec/feature/director-workflow.md (team cards)
  - Memoria spec/interface/push.md
decided_by: neco (2026-09-15 指示)
---

# タスク連携の拡張

2026-09-15 neco 指示の 5 項目を 1 本の設計にまとめる。 どれもチームタスク (`team-task/spec.md`) の上に載る。

| # | 指示 | 本書の節 |
|---|---|---|
| 1 | 通知を Cc / Memoria と連携し、 そちら経由で通知する | §2 |
| 2 | バックログと現在のスプリントに紐づいたタスクだけ表示する | §3 |
| 3 | 人間と AI それぞれの作業を明示的に指定する | §4 |
| 4 | クリティカルパスをタスクに明記する | §5 |
| 5 | プロジェクト / チームを Cc と連携する | §6 |

## 0. 原則

1. **Actio は配送しない。** Discord / WebPush / Alexa を Actio が直接叩かない。 配送は Cc (チーム) と Memoria (個人) が持つ。
   Nuntius は obsolete (Actio #1799 で依存を削除済み)。
2. **正本を複製しない。** チーム・プロジェクトの正本は Cc。 Actio はキャッシュと、 タスクへの参照だけを持つ。
   repo URL / ローカルパスは Actio に保存しない (team-task §2.1 / cc-sync の既存方針)。
3. **必須設定が欠けたら黙らない。** `CONCORDIA_URL` / `MEMORIA_URL` が無いとき、 通知は `failed` として記録し警告を出す。
   no-op で成功扱いにしない (RULE_CODE §7.1)。
4. **計算で決まるものは人に入力させない。** クリティカルパスとスラックは依存と日数から計算し、 手入力列にしない。

## 1. 用語

| 語 | 意味 |
|---|---|
| 現在のスプリント | チームの `sprints.status = 'active'` の 1 件 (チームにつき最大 1 件。 SprintStore が保証済み) |
| 実行者種別 (`executor_type`) | そのタスクの作業を実際に行うのが `human` か `ai` か |
| AI 実行者 (`ai_executor`) | `executor_type=ai` のときの実行主体ラベル。 Cc delegation template の call_name か agent 名 |
| 責任者 | `assignee_id`。 AI が作業するタスクでも結果を確認する人間を必ず置く |
| クリティカルパス | チームの未完了バックログ (依存 DAG) で総所要日数を決める経路。 スラック 0 のタスクの列 |
| Cc プロジェクト | Cc `project_codes` の 1 行。 Actio では `code` (例 `At`) で参照する |

## 2. 通知を Cc / Memoria 経由にする

### 2.1 通知イベント

| イベント | 契機 | 宛先の決め方 |
|---|---|---|
| `task.assigned` | 作成・更新で担当者が別人に変わった | 新担当者 |
| `task.completed` | status が done に変わった | owner (+ 担当者が別人なら担当者) |
| `task.priority_raised` | priority が上がった | 担当者 (無ければ owner) |
| `task.deadline_soon` | 期限の `notify_before_minutes` 前 (既定 60 分、 チーム設定で変更) を tick が検出 | 担当者 (無ければ owner) |
| `task.executor_changed` | `executor_type` / `ai_executor` が変わった | 責任者 |
| `sprint.started` / `sprint.closed` | SprintStore の start / close | チーム |

イベントの生成は `modules/task/notifications/events.ts` (純粋関数: 変更前後のタスクからイベント列を返す)。

### 2.2 配送経路の選択 (`modules/task/notifications/route.ts`, 純粋関数)

| タスク | 経路 | 送り先 API |
|---|---|---|
| `team_id != null` | **Cc** | `POST {CONCORDIA_URL}/v1/teams/:teamId/cards` `{kind:"task-kanban", title, body}` (既存種別。 Cc 変更不要) |
| `team_id == null` (個人タスク) | **Memoria** | `POST {MEMORIA_URL}/api/notifications` `{title, body, url, tag, source:"actio", event, task_id}` (Memoria に新設、 §2.5) |

- `sprint.*` は常に Cc。
- 本文には担当者の表示名を入れない (個人データは Cernere 正本)。 `@` mention は入れず、 Actio WebUI へのリンクを先頭に置く。
- `CONCORDIA_URL` / `MEMORIA_URL` は Excubitor の topology (`concordia` / `memoria-server` の provides) から注入される。

### 2.3 送信箱 (`task_notifications`)

通知はタスク更新のトランザクションから切り離し、 送信箱に積んでから配送する。 API 応答を配送待ちで遅らせない。

| 列 | 型 | 説明 |
|---|---|---|
| `id` | TEXT PK | |
| `task_id` | TEXT nullable | `sprint.*` は null |
| `team_id` | TEXT nullable | |
| `event` | TEXT NOT NULL | §2.1 |
| `channel` | TEXT NOT NULL | `concordia` / `memoria` |
| `dedupe_key` | TEXT NOT NULL UNIQUE | `event:task_id:変化の識別子` (例 `task.deadline_soon:<id>:<deadline>`)。 再送・tick の重複を防ぐ |
| `payload` | JSON NOT NULL | title / body / url |
| `status` | TEXT NOT NULL | `pending` / `sent` / `failed` |
| `attempts` | INTEGER NOT NULL default 0 | |
| `last_error` | TEXT nullable | URL・トークンを含めない短い理由 |
| `created_at` / `sent_at` | timestamp | |

- 配送 worker (`modules/task/notifications/dispatcher.ts`) は起動時 + 1 分 tick で `pending` を送る。
  失敗は `attempts` を増やし、 5 回で `failed` に固定する。 設定欠落は即 `failed` (`last_error = "CONCORDIA_URL is not configured"` 等)。
- 期限前通知の検出 (`deadline-scanner.ts`) も同じ tick で走り、 `dedupe_key` で 1 回だけ積む。
- `GET /api/tasks/notifications?status=failed` (admin) で失敗を見られるようにする。

### 2.4 Port

`NotificationSink` (`deliver(channel, payload): Promise<void>`) を port にし、 実装を
`concordia-sink.ts` / `memoria-sink.ts` に分ける。 テストは fake sink を注入する (team-task §17 の port 方針)。

### 2.5 Memoria 側 (Memoria リポの変更)

- `POST /api/notifications` を新設 (`server/routes/notifications.ts`)。 body を検証し、 既存の `sendNotificationToAll` (WebPush + Alexa) へ渡す。
- Memoria はシングルユーザー・loopback 前提。 既存 `/api/*` と同じ信頼境界で受ける。
- `source` / `event` / `task_id` は通知タグに使い、 同じ `tag` の重複表示を端末側でまとめる。
- 仕様は Memoria `spec/interface/notifications.md` に書く。

## 3. バックログと現在のスプリントだけを表示する

### 3.1 API

`GET /api/tasks?team_id=<id>&view=current_sprint` を追加する (`view` は新パラメタ、 `team_id` 必須)。

返すタスク:

- 現在のスプリント (`status=active`) に所属するタスク (状態を問わない。 スプリント内の完了も見せる)
- バックログ (`lane=backlog`) で **どのスプリントにも割り付いていない**、 未完了 (`done` / `cancelled` 以外) のタスク

返さないタスク: 日常レーン、 過去 (closed) / 未来 (planning) のスプリントに所属するタスク、 完了済みの未割付バックログ。

応答に `current_sprint` (無ければ null) を同梱し、 画面が「進行中のスプリントがありません」を出せるようにする。
抽出条件は `modules/task/views/current-sprint-view.ts` (純粋関数 + repo の条件組み立て) に置く。

### 3.2 WebUI

- 計画画面 (`PlanningPage`) に表示切替 `現在のスプリントとバックログ` (既定) / `すべて` を置く。
- 既定表示では 2 区画に分ける: 「スプリント: <名前> (<開始>〜<終了>)」 と 「バックログ (未割付)」。
- タスク一覧画面 (`TasksPage`) でチームを選んだときも同じ `view` を既定にする。

## 4. 人間と AI の作業を明示する

### 4.1 `tasks` 追加列

| 列 | 型 | 説明 |
|---|---|---|
| `executor_type` | TEXT NOT NULL default `human` | `human` / `ai` |
| `ai_executor` | TEXT nullable | `executor_type=ai` のときだけ。 1〜128 文字、 英数と `-_.:/@` |

既存 `creator_type` (作成主体) はそのまま残し、 意味を分ける: **だれが登録したか = `creator_type`、 だれが作業するか = `executor_type`**。

### 4.2 検証 (`modules/task/validation/executor.ts`, 純粋関数)

- `executor_type` は `human` / `ai` のみ。
- `ai_executor` は `executor_type=ai` のときだけ許可 (`human` で指定すると 400)。 `ai` で省略は可 (後で割り当てる)。
- チームタスクでは `executor_type` に関わらず `assignee_id` (責任者) を必須のまま (team-task §2.1)。
- `executor_type` を `human` に戻したら `ai_executor` を null にする。

### 4.3 API / 絞り込み / 表示

- 作成・更新 API で `executorType` / `executor_type`、 `aiExecutor` / `ai_executor` を受ける。
- `GET /api/tasks?executor_type=ai|human` で絞り込む。
- WebUI: 作成フォームに「作業者: 人間 / AI」 と AI 実行者の入力。 一覧・計画表にバッジ (`人間` / `AI: <ai_executor>`)。
- 外部 API (`/api/external/tasks`) の docs とレスポンスにも同じ 2 項目を足す。

## 5. クリティカルパスをタスクに明記する

### 5.1 計算 (`modules/task/critical-path/compute.ts`, 純粋関数)

- 対象: チームの未完了タスクのうち `lane=backlog` (スプリント割付の有無は問わない)。
- 所要日数: `duration_days` → 無ければ `estimated_minutes / チーム設定 default_daily_minutes` (既定 120, 切り上げ) → どちらも無ければ 1 日。
  所要の出所を `duration_source` (`duration_days` / `estimate` / `default`) として結果に含める。
- `blocked_by` で DAG を作り、 前進計算 (最早開始・最早終了) と後退計算 (最遅開始・最遅終了) を行う。
  `slack = 最遅開始 − 最早開始`。 **スラック 0 のタスクをクリティカルパスとする** (最長経路が複数あれば全部)。
- チーム外・完了済みの `blocked_by` 参照は依存から外す (完了済みは待たない)。
- 循環は `cycles` として返し、 循環に含まれるタスクはクリティカル判定から外して `critical_path_error = "cycle"` を付ける。
- 既存 `modules/pm/analytics/critical-path.ts` (PM モジュール用、 時間単位・単一経路) は変更しない。

### 5.2 保存 (`tasks` 追加列)

| 列 | 型 | 説明 |
|---|---|---|
| `is_critical_path` | BOOLEAN NOT NULL default false | |
| `slack_days` | REAL nullable | 計算対象外は null |
| `critical_path_error` | TEXT nullable | `cycle` |
| `critical_path_computed_at` | timestamp nullable | |

- 再計算 (`modules/task/critical-path/recompute.ts`) はチーム単位。 契機: タスクの作成・更新・削除で
  `blocked_by` / `duration_days` / `estimated_minutes` / `status` / `lane` / `team_id` が変わったとき、 スプリント割付の変更、 チーム設定 `default_daily_minutes` の変更。
- 保存はタスク行の一括更新 (トランザクション)。 同一チームの再計算は直列化する (チーム単位のロック)。

### 5.3 API / 表示

- `GET /api/teams/:teamId/critical-path` → `{ taskIds, totalDays, tasks: [{id, slackDays, earliestStart, earliestFinish, durationDays, durationSource}], cycles }`。
- タスクの JSON に `isCriticalPath` / `slackDays` / `criticalPathError` を含める。
- WebUI: 計画表・一覧に `クリティカルパス` バッジ、 スラック日数、 循環エラーの警告。

## 6. プロジェクト / チームを Cc と連携する

### 6.1 同期 (`modules/task/team/cc-project-sync.ts`)

- 既存のチーム同期 (`cc-sync.ts`, 10 分 tick) と同じ tick で Cc `GET /v1/project-codes/admin` を読む。
- `project_refs` に upsert する。 **repo_origin / repo_path は保存しない。**

| 列 | 型 | 説明 |
|---|---|---|
| `code` | TEXT PK | Cc の project code (例 `At`) |
| `name` | TEXT NOT NULL | Cc の project 名 |
| `team_ids` | JSON NOT NULL | Cc の所属チーム id 配列 (`entries[].teams[].id`) |
| `synced_at` | timestamp NOT NULL | |

- Cc から消えたプロジェクトは削除せず `removed_at` を付ける (既存タスクの参照を壊さない)。
- 取得失敗時はキャッシュのまま続行し、 失敗を警告ログに出す (チーム同期と同じ扱い)。

### 6.2 タスクとの紐付け

- チームタスクの `project_id` は Cc project code を指す。 検証 (`modules/task/validation/team-project.ts`):
  `project_id` を指定したチームタスクは、 その project の `team_ids` に `team_id` が含まれなければ 400。 未知の code も 400。
- 個人タスク (`team_id=null`) の `project_id` は従来どおり不透明参照 (EducationLab 連携を壊さない)。

### 6.3 API / 表示

- `GET /api/teams/:teamId/projects` → そのチームに属する Cc プロジェクト (`code`, `name`)。
- `GET /api/projects/cc` → 同期済みプロジェクト一覧 (チーム所属付き)。
- `GET /api/tasks?team_id=&project=<code>` は既存 `project` フィルタで引ける。
- WebUI: バックログ追加フォームにプロジェクト選択 (チームに属するものだけ)、 計画表にプロジェクト列と絞り込み。
- Cc の管理面 (`/projects`) のチーム割り当て変更は、 次の同期 tick で Actio に反映される。

## 7. DB migration

- SQLite (`src/db/dialects/sqlite.ts` / `src/db/migrate-sqlite.ts`)、 Postgres (`src/db/planning-postgres-migration.ts`)、
  MySQL (`src/db/dialects/mysql.ts`) の全方言に同じ列・表を足す (既存 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` / try パターン)。
- Drizzle schema (`src/db/schema.ts` と各 dialect schema) の parity を保つ。
- 追加のみ (DROP なし)。 冪等。

## 8. 実装タスク (1 PR / リポ)

| # | リポ | 内容 |
|---|---|---|
| I1 | Actio | migration + schema parity (§2.3 / §4.1 / §5.2 / §6.1) |
| I2 | Actio | 通知: events / route / 送信箱 repo / dispatcher / deadline scanner / Cc・Memoria sink / failed 一覧 API / タスク routes と SprintStore への配線 |
| I3 | Actio | `view=current_sprint` API + PlanningPage / TasksPage の表示切替 |
| I4 | Actio | executor 列の検証・API・絞り込み・外部 API docs・WebUI バッジとフォーム |
| I5 | Actio | クリティカルパス計算・再計算の配線・API・WebUI バッジ |
| I6 | Actio | Cc プロジェクト同期・検証・API・WebUI のプロジェクト選択と列 |
| I7 | Actio | テスト: 各純粋関数の単体 + routes の結合 (fake sink / fake Cc) |
| M1 | Memoria | `POST /api/notifications` + spec + テスト |

I1〜I7 は Actio 1 PR にまとめる。 M1 は Memoria の 1 PR。 M1 が先にマージされていなくても Actio 側は
`failed` として記録するので壊れないが、 個人タスクの通知が届くのは M1 反映後。

## 9. 受け入れ基準

- [ ] チームタスクの担当変更で Cc の task-kanban カードが 1 回だけ投稿される (同じ変更の再送で増えない)。
- [ ] 個人タスクの完了で Memoria の WebPush が届く。 `MEMORIA_URL` 未設定なら通知は `failed` で残り、 警告が出る。
- [ ] 期限 60 分前の通知が 1 回だけ出る。 期限を変えたら新しい期限で再度 1 回。
- [ ] `view=current_sprint` で日常レーンと closed / planning スプリントのタスクが出ない。 active スプリントが無ければバックログ未割付だけが出て `current_sprint=null`。
- [ ] `executor_type=human` で `ai_executor` を送ると 400。 AI タスクでもチームタスクは責任者必須。
- [ ] 依存 A→B→C (各 2 日) と D (1 日, 依存なし) で A/B/C が `is_critical_path=true`、 D の `slack_days=5`。 循環は `critical_path_error=cycle`。
- [ ] Cc でプロジェクトのチーム割り当てを変えると、 次の同期後に別チームのタスクへそのプロジェクトを付けると 400 になる。
- [ ] `project_refs` に repo URL / パスが保存されていない。
- [ ] `team_id=null` の個人タスク・既存 API が無変更で動く。
