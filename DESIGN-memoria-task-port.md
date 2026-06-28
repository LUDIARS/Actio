# DESIGN — Memoria タスク機能の Actio 移植

> 決定 (2026-06-28): **Actio をタスクの唯一の本拠地** にする。Memoria の
> 個人タスク機能 (毎日 `/mmtask` で使っているもの) を Actio に移植し、
> 実証 + データ移行が済んだら Memoria 側のタスク UI / API を撤去する。

## 1. 背景と方針

- Memoria のタスクは **単一ユーザの個人タスク** (SQLite, integer PK)。
  - 付随機能: kind(task/goal) / category(複数) / creator_type(human/ai) /
    毎朝リマインダ(push) / Discord 通知 / agent-run 委託 / AI タスク整理
    (task-review) / diary・activity ログ。
- Actio のタスクは **多ユーザ JIRA 風** (Drizzle, TEXT/uuid PK)。
  - owner/assignee/group, status 5値, priority, deadline, estimatedMinutes,
    plugin 機構, Cernere 認証, Nuntius 「N分前」リマインダ。
- **方針**: Actio の多ユーザモデルを壊さず **拡張** する。個人タスク =
  「owner=自分 / group=null のタスク」 + `kind` 列。撤去は最後。

### 追加方針 (2026-06-28 ユーザ指示)

1. **認証は当面配線しない**。Actio は将来アクセス時認証を要するが、今は
   個人タスク API を **無認証で動かす** (default user フォールバック)。後で
   Cernere を被せるだけにする (`resolveUserId(c) = getUserId(c) ?? DEFAULT`)。
2. **「Memoria にタスク登録」している既存機能を Actio に読み替える**。
   skill 群 / 他サービスからの Memoria `:5180/api/tasks` POST を Actio へ向ける。
3. **Memoria を当面 Actio タスクのビューア (ハブ的扱い) にする**。専用ハブ
   サービスが出来るまで、Memoria のタスク画面は自前 DB ではなく **Actio API を
   読んで表示** する。Memoria は「閲覧 + 入口」、正本データは Actio。

## 2. フィールドマッピング

| Memoria | Actio | 対応 |
|---|---|---|
| id (int) | id (uuid) | 移行時に uuid 採番。旧 id は `pluginRef`(`memoria:<id>`) で追跡 |
| title | title | 直 |
| details | description | Memoria の details(自由メモ) = Actio description |
| status todo/doing/done | status open/in_progress/done | 別表で相互変換 |
| kind task/goal | **新** kind | 列追加 (default 'task') |
| creator_type human/ai | **新** creator_type | 列追加 (default 'human') |
| due_at (local/UTC string) | deadline (Date) | local 'YYYY-MM-DDTHH:MM' は local tz でパース |
| category (csv) | **新** category (csv text) | 列追加 |
| share_actio / shared_* | — | 廃止 (Actio が本拠地なので自己 share 不要) |
| created_at/updated_at | createdAt/updatedAt | 直 |

### status 相互変換

| Memoria | Actio |
|---|---|
| todo | open |
| doing | in_progress |
| done | done |

Actio 固有の `blocked` / `cancelled` は個人 UI では非表示 (データは保持)。
API は互換のため **todo/doing/done のエイリアス入力も受理** し open/in_progress/done
に正規化する。

### 設定・カテゴリの格納

- カテゴリ登録簿: `user_preferences` key=`task.categories.registered` (per-user JSON)。
  Memoria は global(app_settings) だが Actio は多ユーザのため per-user 化。
- リマインダ設定: `user_preferences` key=`task.reminder.*`
  (`enabled` / `hour` / `minute` / `nuntius_*`)。

## 3. 段階計画 (フェーズ)

各フェーズ = 1 PR (coding-conventions / SRP, CI green 必須)。撤去は最後。

- **Phase A — コア個人タスク parity** ⬅ 着手
  - schema.ts に `kind` / `creator_type` / `category` 追加 + migrate.ts ALTER。
  - `taskRepo` 拡張 (filter に kind, list ソートを Memoria 準拠に)。
  - `categoryRepo` (user_preferences ベース) 追加。
  - `/api/tasks` 拡張: kind/category/creator_type/details/due_at エイリアス受理、
    status エイリアス正規化、categories エンドポイント追加。
  - frontend: 個人タスクボード (task/goal 分割, カテゴリ sidebar, quick add,
    status ドロップダウン, due ショートカット「今日/明日/今週」)。
- **Phase B — 毎朝リマインダ + 通知**
  - per-user 日次サマリ scheduler (時刻設定可) → Nuntius。
  - タスク作成時 Discord 通知 (Nuntius/webhook 経由)。
  - 設定 UI。
- **Phase C — agent-run 委託**
  - `agent_runs` テーブル, 子プロセス spawn(claude/codex/gemini), log file,
    API + UI。Actio サーバ稼働ホスト上で実行する前提を明記。
- **Phase D — AI タスク整理 (task-review)**
  - `task_reviews` テーブル, 朝の LLM scheduler (クラスタ/完了検出),
    確認キュー API + UI。
- **Phase E — データ移行 + 読み替え + Memoria ハブ化**
  - Memoria DB のタスク行 → Actio へ移行スクリプト。
  - 「Memoria にタスク登録」していた skill / サービスを Actio API へ repoint。
  - Memoria のタスク画面を Actio API のビューアに切替 (自前 DB read をやめる)。
    専用ハブサービスが出来るまで Memoria を入口/閲覧ハブとして残す。
  - 認証配線は別途 (本フェーズでは無認証 default user のまま)。

## 4. 留意点 / 未決

- **dialects**: schema.ts(SQLite) が runtime 本体。postgres/mysql dialect への
  列追加は Phase A 内で SQLite 優先、余力で同期 (parity 目標)。
- **認証**: Memoria はローカル無認証。Actio は Cernere 必須。skill (claude -p)
  からの headless POST には api_client トークン経路が要る (Phase E)。
- **due_at の tz**: Memoria は local naive 文字列。Actio は UTC Date 保存。
  日次リマインダの「今日/期限切れ」判定は local tz で計算する。
- **Discord / agent-run / task-review** は Memoria のローカル実行に密。Actio
  サーバ実行モデルでの再現可否を各フェーズ着手時に確認する。
