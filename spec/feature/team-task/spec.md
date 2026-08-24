---
type: feature
title: "チーム別タスク管理 — 日常レーン / バックログ+スプリント / 自動完了レビュー / 朝礼"
description: "Concordia のチーム (teams) を単位に、Actio でタスクを管理する。チームタスクは「日常」と「バックログ」の 2 レーンに分け、「だれが」「なにを」を必須とし、「いつまでに」はバックログのみ必須として登録する。バックログとスプリントの設計は LLM と相談して案を作り、能力・可否の判断は必ず人間が行う。Actio は 1 日 2 回タスク状況をレビューし、コミット・PR 等の証跡からスコアで完了判定し、閾値以下は管理者・チームリーダーの判断を仰ぐ。遅延は権限者限定チャンネルへ報告し、朝礼レポートも Cc の parttimer から Actio 生成へ切り替える。Memoria / Concordia に分散したタスク実装を Actio に集約する。"
service: actio
domain: task-modules
tags:
  - tasks
  - teams
  - sprint
  - backlog
  - review
  - standup
  - concordia
  - llm
status: planned
related:
  - ../../../DESIGN-memoria-task-port.md
  - ../../../../Concordia/spec/feature/teams.md
  - ../../../../Concordia/spec/feature/team-standup-and-review.md
  - ../../../../Concordia/spec/feature/task-workflow.md
  - ../../../../Concordia/spec/feature/reaction-workflow.md
updated: 2026-08-24
---

# チーム別タスク管理

> 2026-08-24 neco 指示。 Cc のチーム設計 (`Concordia/spec/feature/teams.md`) が出来てきたので、
> チーム別のタスク管理を Actio で行うよう実装を調整する。 分散しているタスク実装は Actio に集約する。

## 0. 原則

1. **タスクの正本は Actio。** チーム・セッション・委託・PR の正本は Cc / Revisor のまま
   (teams.md §0 「正本を複製しない」)。 Actio が持つのはタスクとその判定履歴だけ。
2. **人間が決める。** LLM は案 (バックログ分解・スプリント割付・完了スコア) を出すだけで、
   能力/可否判断・承認・閾値以下の完了判定は必ず人間 (管理者 / チームリーダー) が行う。
3. **チームタスクは「だれが」「なにを」を必須にする。** 「いつまでに」はバックログのみ必須とし、
   日常レーンは持たない。 `team_id=null` の既存個人タスクにはこのレーン制約を適用しない。
4. **報告経路は Cc。** Actio は Discord を直接触らず、 Cc のチーム面カード API へ投げる。
5. **証跡の無い完了はしない。** 自動完了は証跡 (マージ済み PR / コミット / 完了 run) に
   紐づくスコアで判定し、 根拠をタスクに残す。 閾値以下は人間へ回す。
6. **サービスを増やさない。** Memoria / Concordia parttimer が持つタスク機能は Actio へ寄せ、
   Cc 側は「登録の入口」と「報告の出口」だけを残す。

## 1. 用語

| 語 | 意味 |
|---|---|
| チーム | Cc `teams` の 1 行。 Actio は id / slug / name をキャッシュするだけで、 チームマスタを持たない |
| 日常タスク (daily) | 積まれていく雑務・小改修。 期日なし。 スプリントに入れない |
| バックログ (backlog) | 計画的に消化する項目。 期日必須。 スプリントに割り付けて実行する |
| スプリント | チーム単位の期間 (既定 1 週間) と、 その期間に消化するバックログ項目の集合 |
| 完了レビュー | 1 日 2 回、 証跡からタスク完了をスコア判定する処理 |
| 判定キュー | 閾値以下のスコアが並ぶ、 人間の裁定待ち列 |
| 権限者 | チームの `leader` ロール保持者と Actio 管理者 (`admin`) |

## 2. データモデル

既存 `tasks` (`src/db/schema.ts`) を壊さず列を足す。 個人タスク (group=null / team=null) は
現行どおり動く (後方互換)。

### 2.1 `tasks` 追加列

| カラム | 型 | 説明 |
|---|---|---|
| `team_id` | TEXT nullable, index | Cc `teams.id` の不透明参照 (FK なし。 `project_id` と同じ扱い) |
| `lane` | TEXT NOT NULL default `daily` | `daily` / `backlog` |
| `sprint_id` | TEXT nullable, index | 所属スプリント (`sprints.id`)。 `lane=backlog` のみ |
| `source` | TEXT nullable | 登録元: `manual` / `cc-taskmd` / `cc-rwf` / `cc-command` / `memoria-import` / `sprint-plan` |
| `source_ref` | TEXT nullable | 登録元の安定識別子 (repo id + task md 相対パス、 RWF メッセージ id、 memoria id 等)。 ローカル絶対パスは保存しない |
| `completion_score` | REAL nullable | 最後の完了レビューのスコア (0.0–1.0) |
| `completion_evidence` | JSON nullable | 完了根拠 (§6.2) |
| `completed_by` | TEXT nullable | `auto` / 判定した user_id |

Cc / Memoria 由来の再送で同じタスクを増殖させないため、`source` と `source_ref` がともに non-null の
行には `UNIQUE (source, source_ref)` の部分インデックスを置き、作成 API は同じ組を冪等キーとして扱う。

**チームタスク (`team_id != null`) の必須項目検証**
(`modules/task/validation/team-task.ts`, 純粋関数):

| 項目 | daily | backlog |
|---|---|---|
| `assignee_id` (だれが) | 必須 | 必須 |
| `title` (なにを) | 必須 | 必須 |
| `deadline` (いつまでに) | **禁止** (null 固定。 付いていれば 400) | **必須** |
| `team_id` | 必須 (チームタスクの場合) | 必須 |

`team_id=null` の個人タスクは既存どおり、未割当や期日付きも許可する。これにより、追加列の
`lane=default daily` が既存個人タスクの更新を拒否しないようにする。

`assignee_id` は `team_members` に属する user でなければならない。 レーン変更
(`daily → backlog`) は期日を同時に付けることを要求し、 `backlog → daily` は期日を落とす。

### 2.2 新規テーブル

```sql
-- Cc teams のキャッシュ + Actio 固有のメンバー/ロール (Cc はメンバー概念を持たない)
CREATE TABLE team_refs (
  id          TEXT PRIMARY KEY,     -- Cc teams.id
  slug        TEXT NOT NULL,
  name        TEXT NOT NULL,
  cc_settings JSON NOT NULL,        -- Cc teams.settings の読み取り専用キャッシュ
  settings    JSON NOT NULL,        -- Actio 固有設定 (§2.3)
  synced_at   TIMESTAMP NOT NULL
);
CREATE TABLE team_members (
  team_id     TEXT NOT NULL,
  user_id     TEXT NOT NULL,        -- Actio users.id (Cernere)
  role        TEXT NOT NULL,        -- leader | member
  PRIMARY KEY (team_id, user_id)
);

CREATE TABLE sprints (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  name        TEXT NOT NULL,
  goal        TEXT,
  starts_on   DATE NOT NULL,
  ends_on     DATE NOT NULL,
  status      TEXT NOT NULL,        -- planning | active | closed
  capacity_minutes INTEGER,         -- 人間が入れる。 LLM は書かない
  approved_by TEXT, approved_at TIMESTAMP,
  created_at TIMESTAMP, updated_at TIMESTAMP
);

-- LLM 相談の記録。 案は「提案」として保存し、 承認は人間の行為で別カラムに残す
CREATE TABLE sprint_plans (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  sprint_id   TEXT,                 -- 承認後に紐づく
  kind        TEXT NOT NULL,        -- backlog-breakdown | sprint-assignment
  prompt_input  JSON NOT NULL,      -- 与えた材料 (バックログ・メンバー・容量・前スプリント実績)
  proposal      JSON NOT NULL,      -- LLM の案 (§5.2)
  human_edits   JSON,               -- 人間が直した差分
  status      TEXT NOT NULL,        -- proposed | approved | rejected
  decided_by  TEXT, decided_at TIMESTAMP,
  created_at TIMESTAMP
);

-- 完了レビューの実行と、 タスクごとの判定
CREATE TABLE task_reviews (
  id          TEXT PRIMARY KEY,
  team_id     TEXT NOT NULL,
  review_date DATE NOT NULL,        -- チーム設定 timezone での日付
  ran_at      TIMESTAMP NOT NULL,
  slot        TEXT NOT NULL,        -- morning | evening
  status      TEXT NOT NULL,        -- running | succeeded | failed
  finished_at TIMESTAMP,
  summary     JSON NOT NULL,        -- 自動完了 n 件 / 判定待ち n 件 / 遅延 n 件 / 取得失敗
  UNIQUE (team_id, review_date, slot)
);
CREATE TABLE task_review_items (
  id          TEXT PRIMARY KEY,
  review_id   TEXT NOT NULL,
  task_id     TEXT NOT NULL,
  score       REAL NOT NULL,
  evidence    JSON NOT NULL,        -- §6.2
  evidence_fingerprint TEXT NOT NULL, -- 正規化した証跡 ID 群のハッシュ
  verdict     TEXT NOT NULL,        -- auto_done | needs_decision | no_change
  decision    TEXT,                 -- done | keep_open | reject (人間)
  decided_by  TEXT, decided_at TIMESTAMP
);

-- 遅延の検出履歴 (同じ遅延を毎回報告しないための冪等キー)
CREATE TABLE task_delays (
  task_id     TEXT NOT NULL,
  detected_on DATE NOT NULL,
  days_late   INTEGER NOT NULL,
  reported_at TIMESTAMP,
  PRIMARY KEY (task_id, detected_on)
);
```

### 2.3 チーム設定 (`team_refs.settings`)

Cc `teams.settings` (A 層 typed settings) は `team_refs.cc_settings` へ同期する。以下の Actio 固有項目は
`team_refs.settings` に分離し、leader/admin の設定 API が管理する。Cc 同期で上書きしない:

```jsonc
{
  "sprint_length_days": 7,
  "review_slots": ["09:00", "18:00"],      // JST。 朝礼 (09:30) より前に朝スロットを置く
  "completion_threshold": 0.8,            // これ以上で自動完了
  "delay_grace_days": 0,                  // 期日からこの日数までは遅延扱いしない
  "daily_stale_days": 14,                 // 日常タスクの滞留警告
  "standup_enabled": true,
  "timezone": "Asia/Tokyo"
}
```

Cc `team_repos` 由来の安定 ID は `cc_settings.repo_ids` (例: `["cernere"]`) として同期し、
サーバー側のリポジトリカタログで検証済みローカルパスへ解決する。API 入力、DB、LLM プロンプト、
カード本文には絶対パスを出さない。

## 3. ロールと権限

| 操作 | member | leader | admin |
|---|---|---|---|
| 日常タスクの登録・自分担当の状態変更 | ○ | ○ | ○ |
| バックログ登録 (期日必須) | ○ | ○ | ○ |
| LLM 相談 (分解・割付案の生成) | ○ | ○ | ○ |
| スプリント案の承認・却下・容量入力 | × | ○ | ○ |
| 判定キューの裁定 (閾値以下の完了判断) | × | ○ | ○ |
| 遅延レポートの閲覧 | × | ○ | ○ |
| チーム設定 (閾値・スロット) | × | ○ | ○ |
| メンバー/ロール変更 | × | × | ○ |

ロールは `team_members.role` + Cernere から検証した `role=admin`。legacy の Actio `users.role` は
新規コードから読み書きしない。 判定 API は admin の明示的なバイパスを持つ
`requireTeamRole(teamId, ["leader"])` ミドルウェアで守る (`src/auth/team-role.ts`)。
Cc から叩くサービス経路は Cc の service token (既存 `api_client` 経路) を使い、 その場合の
「判断者」は Cc が渡す `decided_by` (Discord participant → Actio user のマッピング) を必須にする。
**マッピングできない判断は受理しない** (匿名の裁定を残さない)。
タスク登録用と裁定用の scope は分離し、裁定 scope を持たない service token では
`PATCH review-items` を拒否する。

## 4. 2 レーン運用

```
 日常レーン (daily)                      バックログ (backlog)
 ────────────────                      ────────────────────────────
 積まれる → 空いた人が拾う → done        登録 (期日必須) → LLM と分解・割付案 → 人間承認
 期日なし・スプリント外                   → スプリント active → 消化 → 完了レビュー → done
                                          ↓ 期日超過
                                        遅延レポート (権限者限定)
```

- ボード表示は「今のスプリント」「日常」「バックログ (未割付)」の 3 列を既定にし、
  日常を潰しながらスプリントを回せるよう **同じ画面に並べる**。
- 日常タスクは期日を持たないので遅延判定の対象外。 代わりに **滞留日数** (作成からの経過) を
  朝礼で出す (`daily_stale_days`)。
- 日常タスクを「やはり計画的にやる」と決めたときは `backlog` へレーン変更する (期日を同時に付ける)。

## 5. バックログ分解とスプリント設計 (LLM 相談 + 人間判断)

### 5.1 流れ

1. leader が `POST /api/teams/:teamId/sprints` でスプリント枠 (期間・目標) を `planning` で作る。
   `capacity_minutes` はここで人間が入れる (LLM に見積もらせない)。
2. `POST /api/teams/:teamId/sprint-plans {kind, sprint_id?, items?}` で LLM に相談する。
   Actio は `claude -p --model <固定>` を spawn し (`src/llm/claude-cli.ts`。 API キーは持たない、
   モデルは既定任せにせず固定する) 、 材料と出力スキーマを渡す。
   - `backlog-breakdown`: 粗いバックログ項目を、 1 スプリントで終わる粒度に分解した案
   - `sprint-assignment`: 未割付バックログを、 メンバー・期日・容量に照らして
     「どれを・だれに・このスプリントに入れるか」の案
   - プロンプトのメンバー情報は不透明な user id と容量だけに限定し、氏名・メールアドレス等の
     Cernere 個人情報、ローカルパス、秘密情報は含めない
3. 案は `sprint_plans.status=proposed` で保存し、 WebUI と Cc (direction 面 `meeting` カード相当) に出す。
4. leader が WebUI で**項目ごとに** 採用 / 修正 / 却下 し、 `PATCH .../sprint-plans/:id {status: approved, human_edits}`。
   承認時に初めて tasks (lane=backlog, sprint_id, assignee, deadline) が書き込まれる。
5. `PATCH .../sprints/:id {status: active}` で開始。

### 5.2 LLM 出力スキーマ (proposal)

```jsonc
{
  "items": [
    {
      "title": "...", "description": "...",
      "suggested_assignee": "user_id | null",   // 候補に過ぎない
      "suggested_deadline": "2026-08-31",
      "estimated_minutes": 120,
      "rationale": "...",
      "questions": ["この項目は Cernere 側の変更も要るか?"]   // 決められないことは質問にする
    }
  ],
  "capacity_note": "合計 1,560 分 / 容量 1,800 分"
}
```

制約 (プロンプトに明記し、 検証も入れる):

- **能力の断定をしない**: 「A さんはできる/できない」は書かない。 割付は候補と理由だけ。
- **決められないことは `questions` に残す** (Thaleia ux-inquiry と同じ流儀)。
- 案の中に既存タスクの状態変更を含めない (承認前に副作用なし)。
- 出力が JSON スキーマに合わなければ保存せず 502 (無言フォールバック禁止)。

## 6. 完了レビュー (1 日 2 回)

### 6.1 実行

- Actio 内の scheduler (`src/scheduler/`, 新設。 既存 Nuntius リマインダ tick と同じ常駐ループ) が
  チームごとに `review_slots` の時刻で `runTeamReview(teamId, slot)` を起動する。
- 対象: `team_id` 一致 かつ `status in (open, in_progress, blocked)` のタスク。
- 1 チームの失敗は他チームに波及させない (Cc fanout と同じ)。
- `(team_id, review_date, slot)` を冪等キーにし、同一スロットの多重起動は 1 実行にまとめる。
  失敗は同じ行を再試行し、次スロットを成功扱いにしない。初回収集の `since` はタスク作成時刻、
  以後は直前の成功レビュー時刻とする。

### 6.2 証跡の収集 (`modules/task/review/evidence/*`)

collector は独立ファイルで、 増やせる。 v1:

| collector | 取り方 | 証跡 |
|---|---|---|
| `git-commits` | `cc_settings.repo_ids` をサーバー側カタログで解決した各リポで `git log --since=<前回成功レビュー>` (Actio と同一ホスト前提。 DESIGN-memoria-task-port §3 Phase C と同じ前提) | タスク id / slug を メッセージ・ブランチ名に含むコミット |
| `revisor-prs` | Revisor local PR API (マージ済み PR の一覧) | タイトル・本文・ブランチにタスク参照を含むもの |
| `cc-runs` | Cc `GET /v1/delegation/runs?team_id=&status=completed&since=` | `metadata.actio_task_id` が一致する完了 run |
| `cc-sessions` | Cc `GET /v1/sessions?team_id=&since=` | `current_task` にタスク id を持ち正常終了したセッション |

参照の突合キーは **タスク id (uuid) と `source_ref` の task md ファイル名から正規化した slug**。 Cc の task-md
reconciler が Actio に登録する際、 タスク id をブランチ名規約 `feat/<slug>` と task md に結びつける
(§8.1) ので、 コミット側に id を書かせなくても slug で引ける。

collector は証跡の照合前に秘密情報・個人情報を除去する。保存・LLM 送信・Cc カード出力に使う
`repo` は安定 ID、コミット本文は件名だけとし、トークン、URL の認証情報、メールアドレス、
ローカル絶対パスを redaction する。生ログ、diff、セッション transcript は収集しない。

`completion_evidence` の形:

```jsonc
{ "commits": [{"repo": "...", "sha": "...", "subject": "..."}],
  "prs":     [{"repo": "...", "number": 12, "merged_at": "..."}],
  "runs":    [{"run_id": "...", "completed_at": "..."}],
  "sessions":[{"session_id": "...", "ended_at": "..."}],
  "llm":     {"score": 0.7, "reason": "..."} }
```

### 6.3 スコア

決定論スコアを主、 LLM を従にする (Cc task-workflow §0-4 の黒箱思想に合わせる)。

```
score = clamp( w_pr * has_merged_pr
             + w_run * has_completed_run
             + w_commit * min(commit_count, 3) / 3
             + w_session * has_completed_session
             + w_llm * llm_score , 0, 1 )
既定: w_pr 0.5 / w_run 0.2 / w_commit 0.15 / w_session 0.05 / w_llm 0.1
```

- LLM (`claude -p`) は証跡の要約と「タスク本文に対してこの証跡で完了と言えるか」を 0–1 で返す
  だけ。 LLM 不通なら `llm_score=0` として決定論部分だけで判定し、 その事実を evidence に残す。
- **`score >= completion_threshold`** → `status=done`, `completed_by=auto`, `completion_score/evidence` 保存,
  `verdict=auto_done`。
- **`0 < score < threshold`** → `verdict=needs_decision` で判定キューへ。 タスクは変更しない。
- **証跡ゼロ** → `no_change`。 記録だけ残す。
- マージ済み PR があるのに `needs_decision` になるケース (本文と PR がずれている等) は
  判定キューで「実態は終わっているのに未完了」として扱う (Cc 朝礼の「ズレ」に相当)。

### 6.4 判定キュー

- `GET /api/teams/:teamId/review-queue` (leader/admin) で `needs_decision` を列挙。
- `PATCH /api/teams/:teamId/review-items/:id {decision: done | keep_open | reject, note}`。
  `done` でタスク完了 (`completed_by=<user>`)。 `keep_open` は次回レビューで再判定。 `reject` は
  証跡が無関係だったことを記録し、 同じ証跡では再提示しない。
- 「同じ証跡」は `evidence_fingerprint` で判定する。`reject` 済み fingerprint は次回以降の
  スコア入力から除外し、JSON 文字列表現の比較には依存しない。
- レビュー実行後、 判定待ちが 1 件以上あれば Cc へ `review` カードを投げる (§8.3)。
  カードには項目番号 (`R-1` 形式) を振り、 Cc 側で番号返信 → Actio PATCH に変換できるようにする
  (Cc 定例の議題番号と同じ流儀)。

## 7. 遅延レポート (権限者限定)

- 毎回のレビューで `lane=backlog` かつ未完了を対象に、チーム設定 timezone の暦日で
  `today > deadline の日付 + delay_grace_days` を満たすものを検出し、
  `task_delays (task_id, detected_on)` に冪等記録する。
- 当日初検出分と継続分をまとめ、 Cc へ `delay` カードを投げる。 内容: タスク / 担当 / 期日 /
  遅延日数 / 直近の証跡有無 / 所属スプリント。
- **投稿先は権限者しか見えないチャンネル**。 Cc teams のチーム面に **`管理` 面 (`management`)**
  を追加し、 Discord 側でチーム leader ロール + 管理者のみ閲覧可の permission overwrite を
  プロビジョニングする (Cc 側変更, §10)。 面が未プロビジョニングなら Cc の既定どおり
  スキップし、 Actio は `reported_at` を空のまま残して次回再送する。
- 担当者本人への通知は別 (通常のリマインダ経路: Nuntius 「期日 N 日前」)。 遅延レポートは
  管理側の可視化であり、 本人を晒す面には流さない。

## 8. Concordia 連携

### 8.1 登録の入口 (Cc → Actio)

| 経路 | 現状 | 変更後 |
|---|---|---|
| task-md reconciler (task-workflow §2.2) | Memoria `createTask` | Actio `POST /api/tasks` (`source=cc-taskmd`, `source_ref=<repo-id>/spec/tasks/<file>`, `team_id` は repo → team の逆引き、 `lane=backlog`, `deadline` は md frontmatter `due` (新規キー、 無ければ登録を保留し direction 面へ質問カード)、 `assignee_id` はセッション所有者) |
| RWF `memoria-task` / `defer-impl` / `memoria-remaining` (📝 ✅ ⏭️ 🫡) | headless cwd=Memoria で Memoria API | headless が Actio API を叩く (`source=cc-rwf`, `source_ref=<chat_message_id>`)。 レーンは既定 `daily`。 期日を伴う指示文 (「〜までに」) を検出したら `backlog` + deadline |
| `/co-task` (新設) / `/co-spawn task:` | Memoria 未完了タスクのキャッシュ (`memoria-task-cache.ts`) | Actio `GET /api/tasks?team_id=&status=open` を同じ stale-while-revalidate で引く (`actio-task-cache.ts`)。 `metadata.actio_task_id` を記録 |
| セッション正常終了時の完了 (`end-session-flow.ts`) | Memoria を done | Actio へは **done を送らない**。Cc セッションの `current_task` と正常終了を保存し、Actio の `cc-sessions` collector が証跡として取得する。完了判定は §6 のレビューに一本化する |

`task md` に `lane:` / `due:` を足す件は task-workflow §2.1 の「frontmatter は 5 キーだけ」の改訂になる。
バックログ (期日必須) と日常 (期日なし) の区別を md 側に持たせる最小追加に留める。

### 8.2 チーム同期 (Cc → Actio)

- Actio は起動時と 10 分 tick で Cc `GET /v1/teams` を読み `team_refs` を upsert する
  (id / slug / name / cc_settings。`repo_ids` を含む)。 Cc 由来フィールドは読み取り専用で、
  Actio 固有の `settings` は保持する。
- メンバーとロールは Actio 正本 (`team_members`)。 Cc participants (Discord handle) と Actio user の
  対応は Cernere の identity API で解決し、必要なら Redis の揮発キャッシュだけに置く。
  `user_preferences` は個人識別情報の保管に使わない。Cc からの裁定 (`decided_by`) はこの経路で解決する。

### 8.3 報告の出口 (Actio → Cc)

Cc `POST /v1/teams/:id/cards {kind, title, body}` を使う。 種別は固定集合なので Cc 側に 2 種を足す:

| kind | 面 | 用途 |
|---|---|---|
| `standup` (既存) | 目標 | 朝礼レポート (§9) |
| `review` (新) | direction | 判定キューの提示 (番号付き) |
| `delay` (新) | 管理 (新・権限者限定) | 遅延レポート (§7) |

本文は Cc が embed 上限で切り詰めるので、 Actio 側で要約 + WebUI へのディープリンクを先頭に置く。

## 9. 朝礼レポート (Actio 生成へ切替)

- Actio scheduler が 09:30 JST にチームごとに `buildStandupReport(teamId)` を作り `standup` カードを投げる。
  材料は朝スロット (09:00) の完了レビュー結果をそのまま使うため、 朝礼のために再収集しない。
- 構成 (Cc team-standup-and-review §3 の項目に揃え、 読み手の慣れを壊さない):
  1. **対応**: スプリント進捗 (消化/残/期日) ・ 日常タスクの滞留 ・ 自動完了した件 (証跡付き)
  2. **ズレ**: `needs_decision` の件数と `R-n` 番号 (裁定は direction 面の `review` カードへ)
  3. **遅延**: 件数のみ (詳細は管理面。 目標面には担当者名を書かない)
  4. **今日効く 3 点**: 期日が近い順の backlog 3 件 + 滞留が長い daily 1 件
- **稼働 (Excubitor の state / health)** は v1 では Actio に持ち込まない。 Cc 側 parttimer を
  「稼働だけ」に縮めるか、 Actio が Excubitor read API を引くかは §11 の未決。
- 切替手順: Actio 側の朝礼が 3 営業日安定して出たら、 Cc の `team-standup-daily` parttimer を
  deactivate する。 定例 (`team-review-regular`, 火金 13:00, 人間同席) は Cc に残し、 材料の
  参照先を Memoria から Actio API へ差し替える。

## 10. 集約 (他サービスからの移設)

| 現在の置き場 | 機能 | 行き先 |
|---|---|---|
| Memoria | 個人タスク API / 毎朝リマインダ / AI タスク整理 | Actio (DESIGN-memoria-task-port Phase A–E。 本設計は Phase E の「Memoria ハブ化」を **不要** にする — Cc の入口が Actio を直接向くため) |
| Cc `src/discord/memoria-task-cache.ts` | spawn の task 選択 | Actio API を引く `actio-task-cache.ts` へ置換 |
| Cc RWF (📝 ✅ ⏭️ 🫡, cwd=Memoria) | タスク登録 | Actio API へ |
| Cc `team-standup-daily` parttimer | 朝礼 | Actio scheduler (§9) |
| Cc `team-review-regular` parttimer | 定例 (人間同席) | **Cc に残す**。 参照先を Actio へ |
| Cc `director-task-organize-daily` | タスク整理 | Actio の完了レビュー + 判定キューで代替。 重複するので deactivate |
| Thaleia | (タスク管理系の実装は **無し**: 突合 / relay / trace / ux-inquiry / spec-tune のみ) | 移設対象なし。 §11 で確認 |

Cc 側に必要な変更 (Cc リポの task md として別途起こす):

1. チーム面に `管理` (management, 権限者限定) を追加し、 `team-provision.ts` で permission overwrite を冪等に用意する。
2. `POST /v1/teams/:id/cards` の kind に `review` / `delay` を追加し、 `team-card-routing.ts` で面を割り当てる。
3. task-md reconciler / RWF / spawn task 選択 / end-session-flow の Memoria 依存を Actio API へ差し替える。
4. `review` カードの番号返信を Actio `PATCH review-items` へ変換する ingress (定例の番号返信と同じ機構)。

## 11. 未決 (人間の判断待ち)

- **Thaleia の「実装」の実体**: 今回 Thaleia リポを確認した範囲ではタスク管理に当たるコードは無い。
  neco の指す「Thaleia が持っている実装」が Memoria / Cc parttimer を指すのか、 別物か要確認。
- **稼働 (Excubitor) 項目の置き場** (§9)。
- **Cernere identity API の Discord → Actio user 解決契約** (未登録時の登録導線を含む)。
- **task md の `lane` / `due` キー追加**を task-workflow §2.1 の改訂として認めるか。
- **完了レビューの LLM 重み** (`w_llm 0.1`) と閾値 0.8 の初期値。 運用で調整する前提。

## 12. 実装フェーズ (各 1 PR, coding-conventions / SRP)

| Phase | 内容 | 依存 |
|---|---|---|
| T1 | schema (tasks 追加列 / team_refs / team_members / sprints / sprint_plans / task_reviews / task_review_items / task_delays) + 全対応 DB dialect の migrate / schema parity + 必須項目バリデーション + レーン API | なし |
| T2 | Cc チーム同期 (`team_refs`) + ロール middleware + メンバー管理 API | T1 |
| T3 | スプリント API + LLM 相談 (`claude -p`) + 承認フロー + WebUI (3 列ボード / スプリント計画画面) | T1, T2 |
| T4 | 完了レビュー scheduler + evidence collectors + スコア + 判定キュー API/UI | T1, T2 |
| T5 | 遅延検出 + Cc `delay` カード + `review` カード送出 | T4 |
| T6 | 朝礼レポート生成 + Cc `standup` 送出 + Cc parttimer 切替 | T4, T5 |
| T7 | Cc 側差し替え (reconciler / RWF / spawn / end-session) + Memoria 撤去 | T1–T6 |

## 13. 受け入れ基準

- [ ] `team_id` 付きタスクでは、`lane=daily` に期日を付けると 400、 `lane=backlog` で期日なしは
  400、担当なしはどちらも 400。`team_id=null` の既存個人タスクは従来どおり更新できる。
- [ ] スプリント案は LLM が生成しても、 leader の承認操作なしにタスクが作られない。
- [ ] 完了レビューが 1 日 2 回チームごとに冪等に走り、合成スコアが閾値以上のタスクは自動 done、
  根拠が `completion_evidence` に残る。マージ済み PR だけで閾値未満なら判定キューに残る。
- [ ] 閾値以下は判定キューに並び、 leader/admin 以外は裁定できない。 裁定者不明の裁定は拒否される。
- [ ] 期日超過タスクは `delay` カードとして権限者限定面にだけ出る (目標面に担当者名が出ない)。
- [ ] 09:30 の朝礼カードが Actio から目標面に出る。 Cc の朝礼 parttimer 停止後も内容の項目が保たれる。
- [ ] Cc の RWF / task-md / spawn からの登録が Actio に入り、 Memoria に新規タスクが作られなくなる。
- [ ] Cc / Memoria から同じ `source` + `source_ref` を再送してもタスクが重複作成されない。
- [ ] `team_id` NULL の個人タスク・既存 API が無変更で動く。
