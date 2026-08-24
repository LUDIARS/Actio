---
type: feature
title: "チーム別タスク管理 — 日常レーン / バックログ+スプリント / 自動完了レビュー / 朝礼"
description: "Concordia のチーム (teams) を単位に、Actio でタスクを管理する。チームタスクは「日常」と「バックログ」の 2 レーンに分け、「だれが」「なにを」を必須とし、「いつまでに」はバックログのみ必須として登録する。バックログとスプリントの設計は LLM と相談して案を作り、能力・可否の判断は必ず人間が行う。Actio は 1 日 2 回タスク状況をレビューし、コミット・PR 等の証跡からスコアで完了判定し、閾値以下は管理者・チームリーダーの判断を仰ぐ。遅延は権限者限定チャンネルへ報告し、朝礼レポートも Cc の parttimer から Actio 生成へ切り替える。Memoria / Concordia / Calliope に分散したタスク・スプリント実装を Actio に集約する。"
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
  - ../myplan/spec.md
  - ../pm/spec.md
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
   日常レーンは持たない。
   **既定の `input_mode=minimal` では人間の入力は「だれが」「何日」だけ**で、 期日・見積り・レーン・
   スプリント所属は自動導出する (§19)。 期日必須は `input_mode=full` のときだけ。 `team_id=null` の既存個人タスクにはこのレーン制約を適用しない。
4. **報告経路は Cc。** Actio は Discord を直接触らず、 Cc のチーム面カード API へ投げる。
5. **証跡の無い完了はしない。** 自動完了は証跡 (マージ済み PR / コミット / 完了 run) に
   紐づくスコアで判定し、 根拠をタスクに残す。 閾値以下は人間へ回す。
6. **サービスを増やさない。** Memoria / Concordia parttimer が持つタスク機能は Actio へ寄せ、
   Cc 側は「登録の入口」と「報告の出口」だけを残す。
7. **スプリントの実装も Actio 一本。** Calliope `src/sprint/*` / `src/risk/*` のスプリント計算は
   Actio へ移植し、 スプリントの正本実装は Actio にする (2026-08-24 neco 指示:
   「Calliope ではなく Actio に集約」)。 Calliope の既存実装 (PR #5 / #17 でマージ済、 PROJECTHUB 用) は
   **当面残す** (neco 判断 2026-08-24)。 撤去は PROJECTHUB の利用状況を見て別途決める。

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

### 5.3 スプリント計算エンジン (Calliope から移植)

Calliope に既にある実装 (`src/sprint/` 13 ファイル + `src/risk/` 約 1,750 行、 テスト付き、 PR #5 / #17 マージ済) から
純粋関数群を `modules/task/sprint/` へ移植し、 チームタスクのスプリント正本を Actio に置く。
LLM 相談 (§5.2) の材料 (容量残・候補・停滞) はこのエンジンの出力を渡す。

| Calliope (現在) | Actio 移植先 | 内容 |
|---|---|---|
| `src/sprint/capacity.ts` `calculateSprintCapacity` | `modules/task/sprint/capacity.ts` | 容量 − 除外 (休暇等) − 割付済の残容量 |
| `src/sprint/candidates.ts` `buildCandidates` | `modules/task/sprint/candidates.ts` | 未割付バックログから候補列を作る (期日・優先度順) |
| `src/sprint/progress.ts` `compose…Progress` | `modules/task/sprint/progress.ts` | sprint health / burndown / 停滞タスクの on-demand 合成 (保存しない) |
| `src/risk/score.ts` / `engine.ts` | `modules/task/sprint/risk.ts` | 遅延リスクスコア。 §7 の遅延検出の材料にも使う |
| `src/sprint/engine.ts` `makeSprintEngine` (設計/replan/close) | `modules/task/sprint/engine.ts` | 依存を Actio の repo 層に差し替える。 案の適用は §5.1 の承認フロー経由のみ |

- 移植は **ロジックのみ**。 Calliope の velocity 裁定 (PROJECTHUB) や Gompertz 収束予約など
  学生 PJ 固有の前提は持ち込まず、 チーム設定 (§2.3) の値で動くようにする。
- Calliope の `projecthub:*` スプリント (docs/design/projecthub-pm.md H4、 PR #17 で **実装済み**。
  `spec/tasks/2026-07-16-05-projecthub-sprint-progress.md` は status 未更新) は **当面そのまま残す**。
  Actio 側は Calliope をコピー元として使うだけで、 実行時に Calliope を呼ばない (両者は独立に動く)。
  Calliope を Actio API (`GET /api/teams/:teamId/sprints/:id/progress`) 利用へ切り替えて撤去するかは、
  PROJECTHUB の利用状況を見て別途判断する (§11)。

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
| Calliope `src/sprint/*` `src/risk/*` | スプリント容量 / 候補 / 進捗 / リスク計算 (実装済) | Actio `modules/task/sprint/*` へ移植 (§5.3)。 Calliope 側は**当面残す** (撤去は §11) |
| Thaleia | (タスク管理系の実装は **無し**: 突合 / relay / trace / ux-inquiry / spec-tune のみ) | 移設対象なし。 §11 で確認 |

Cc 側に必要な変更 (Cc リポの task md として別途起こす):

1. チーム面に `管理` (management, 権限者限定) を追加し、 `team-provision.ts` で permission overwrite を冪等に用意する。
2. `POST /v1/teams/:id/cards` の kind に `review` / `delay` を追加し、 `team-card-routing.ts` で面を割り当てる。
3. task-md reconciler / RWF / spawn task 選択 / end-session-flow の Memoria 依存を Actio API へ差し替える。
4. `review` カードの番号返信を Actio `PATCH review-items` へ変換する ingress (定例の番号返信と同じ機構)。
5. 定例カード返信 → `sprint_retros` (§15.5)、 朝礼返信 `⏱ 6h` → `member_availability`、 `✅ 90m` → `work_logs` の ingress。
6. カード kind に `adjust` (管理面) を追加 (§16.3)。

## 11. 未決 (人間の判断待ち)

- **Thaleia の「実装」の実体**: 今回 Thaleia リポを確認した範囲ではタスク管理に当たるコードは無い。
  neco の指す「Thaleia が持っている実装」が Memoria / Cc parttimer を指すのか、 別物か要確認。
- **稼働 (Excubitor) 項目の置き場** (§9)。
- **Cernere identity API の Discord → Actio user 解決契約** (未登録時の登録導線を含む)。
- **task md の `lane` / `due` キー追加**を task-workflow §2.1 の改訂として認めるか。
- **Calliope スプリント実装の撤去時期**: 当面残す (2026-08-24)。 PROJECTHUB の利用状況を見て
  Actio API 利用へ切り替えるか決める。 それまで二重実装になる点は承知の上。
- **完了レビューの LLM 重み** (`w_llm 0.1`) と閾値 0.8 の初期値。 運用で調整する前提。

## 12. 実装フェーズ (各 1 PR, coding-conventions / SRP)

| Phase | 内容 | 依存 |
|---|---|---|
| T1 | schema (tasks 追加列 / team_refs / team_members / sprints / sprint_plans / task_reviews / task_review_items / task_delays) + 全対応 DB dialect の migrate / schema parity + 必須項目バリデーション + レーン API | なし |
| T2 | Cc チーム同期 (`team_refs`) + ロール middleware + メンバー管理 API | T1 |
| T3 | スプリント API + Calliope エンジン移植 (§5.3) + LLM 相談 (`claude -p`) + 承認フロー + WebUI (3 列ボード / スプリント計画画面) | T1, T2 |
| T4 | 完了レビュー scheduler + evidence collectors + スコア + 判定キュー API/UI | T1, T2 |
| T5 | 遅延検出 + Cc `delay` カード + `review` カード送出 | T4 |
| T6 | 朝礼レポート生成 + Cc `standup` 送出 + Cc parttimer 切替 | T4, T5 |
| T7 | Cc 側差し替え (reconciler / RWF / spawn / end-session) + Memoria 撤去 | T1–T6 |
| (T8) | Calliope 側の撤去 → Actio スプリント API 利用へ切替。 **保留** (§11 の判断後に起こす) | T3 |
| T9 | 見積り/優先度/依存/持ち越し列 + `member_availability` (申告 + MyPlan 推定) + `work_logs` (manual/timer) + クローズ手順 + レトロ (§15) | T1, T3 |
| T9b | ガント: 資源制約スケジューラ + critical-path 一般化 + `gantt_snapshots` + SVG 面 + WS push (§18) | T9 |
| T10 | Memoria 観測 export (Memoria リポ側 PR) + Actio import + cc-session 集計 (§15.3) | T9 |
| T11 | `team_metrics_daily` / `sprint_metrics` / rolling velocity / バーンダウン API + UI (§16.1) | T4, T9 |
| T12 | phase / phase_targets + adjustment engine + `adjust` カード + 承認 UI (§16.2–16.3) | T11 |
| T13 | Clock / EvidenceSource / LlmPort / CardSink の port 化 + `_sim` ルート + シナリオランナー + vitest (§17)。 **T4 以降の PR は T13 のランナーで検証する**ので T4 と並行して先に着手 | T1 |

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

## 14. スクラム前提で足りないもの (2026-08-24 neco 指示による追補)

§1–§13 は「レーン + 完了レビュー + 朝礼」までで、 スプリント/スクラムを回す前提では以下が欠けている。
各項目の行き先を §15–§17 と §12 のフェーズに割り当てる。

| # | 欠けている物 | 現状 | 追補先 |
|---|---|---|---|
| G1 | **見積り** (工数分) と **優先度** がバックログ項目に無い | `tasks` に列が無く、 LLM 案の `estimated_minutes` は proposal に留まる | §15.1 `tasks.estimate_minutes` / `priority` / `story_points`。 見積りは**人間が確定** (LLM は案) |
| G2 | **個人の稼働可能時間** が無く、 `sprints.capacity_minutes` はチーム合計 1 値 | 学生 / インディーズは週ごとに可処分時間が変わる | §15.2 `member_availability` (週次申告) と Actio MyPlan 連携 |
| G3 | **実績時間** の記録が無い (証跡は「終わったか」だけ) | 完了レビューは 0/1 判定 | §15.3 `work_logs` (手動 + Memoria 観測の取り込み) |
| G4 | **ベロシティ** と **バーンダウン** の永続化が無い | Calliope 移植分は on-demand 合成のみ | §16.1 `sprint_metrics` / `team_metrics_daily` |
| G5 | **スプリントクローズ** 時の未消化の扱い (持ち越し / バックログ戻し) が未定義 | `status=closed` にするだけ | §15.4 close 手順 |
| G6 | **レトロスペクティブ** と **スプリントレビュー** の記録が無い | 定例 (Cc) は人間同席だが Actio に残らない | §15.5 `sprint_retros` (Cc 定例カードの返信を取り込む) |
| G7 | **プロジェクトフェーズ** の概念が無い | 調整提案の基準が作れない | §16.2 `team_refs.settings.phase` + フェーズ別の目標値 |
| G8 | **調整提案** (人員追加 / リスケ / 稼働増 / スコープ減) が無い | 遅延は報告するだけ | §16.3 adjustment engine (提案 → 人間承認) |
| G9 | **依存関係** (blocked_by) が無い | Calliope `isReady` が常に true になる | §15.1 `tasks.blocked_by` (pm_tasks と同じ JSON 列) |
| G10 | **WIP 上限** / 同時着手の可視化が無い | 日常レーンを拾い放題 | §15.6 `wip_limit_per_member` (超過は警告のみ) |
| G11 | **Definition of Done** がチームごとに無い | 完了スコアの重みだけ | §15.6 `settings.dod` を LLM 完了判定のプロンプトに渡す |
| G12 | **テスト環境での再現・シミュレーション** が無い | scheduler / 外部 collector は実サービス直結 | §17 |

## 15. スプリント運用の追補 (見積り・稼働・実績・クローズ・レトロ)

### 15.1 `tasks` 追加列 (第 2 弾)

| カラム | 型 | 説明 |
|---|---|---|
| `estimate_minutes` | INTEGER nullable | 人間が確定した見積り (LLM 案の `estimated_minutes` を採用したら書く) |
| `story_points` | INTEGER nullable | 使うチームだけ。 `estimate_minutes` との換算はチーム設定 `minutes_per_point` |
| `priority` | INTEGER NOT NULL default 0 | 大きいほど先。 Calliope `candidates.ts` の並びに使う |
| `blocked_by` | JSON NOT NULL default `[]` | 先行タスク id。 未完了の先行があれば `isReady=false` |
| `carried_from_sprint_id` | TEXT nullable | 持ち越し元 (§15.4)。 持ち越し回数は辿って数える |
| `actual_minutes` | INTEGER NOT NULL default 0 | `work_logs` 合計のキャッシュ (repo 層で更新) |

### 15.2 個人の稼働可能時間 (`member_availability`)

学生 / インディーズは「毎日 N 時間」を確保できないので、 **週単位の申告 + 週次予定からの推定** の 2 段で持つ。

```sql
CREATE TABLE member_availability (
  team_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  week_start   DATE NOT NULL,          -- 月曜 (チーム timezone)
  declared_minutes  INTEGER NOT NULL,  -- 本人申告 (「今週は 6 時間」)
  derived_minutes   INTEGER,           -- Actio MyPlan の空き枠から推定 (参考値、 申告が優先)
  note         TEXT,                   -- 「試験週」「バイト増」等
  updated_at   TIMESTAMP NOT NULL,
  PRIMARY KEY (team_id, user_id, week_start)
);
```

- **申告の入口**: WebUI (ボード上部の「今週の稼働」) と Cc RWF (朝礼カードへの返信 `⏱ 6h` を Actio へ変換)。
  申告が無い週は直近 4 週の実績中央値 (§16.1) を暫定値にし、 暫定である旨を朝礼に出す。
- **MyPlan 連携** (`spec/feature/myplan`): 本人の `my_plans.weekly_schedule` (授業・バイト等) と
  `personal_events` を引いて、 チーム設定 `work_window` (例 10:00–23:00) 内の空き分を `derived_minutes` にする。
  MyPlan は Actio 既存機能なので新サービスは要らない。 未設定なら `derived_minutes=null`。
- **容量の導出**: `sprints.capacity_minutes` の人間入力は残しつつ、 既定値を
  Σ `member_availability.declared_minutes` (スプリント期間内の週) から埋める。 LLM には
  user_id と分数だけ渡す (§5.1 の個人情報制約は維持)。

### 15.3 実績時間 (`work_logs`) — Memoria を「観測源」として使う

```sql
CREATE TABLE work_logs (
  id           TEXT PRIMARY KEY,
  team_id      TEXT NOT NULL,
  user_id      TEXT NOT NULL,
  task_id      TEXT,                   -- null = タスクに紐づかない稼働 (打合せ等)
  logged_on    DATE NOT NULL,
  minutes      INTEGER NOT NULL,
  source       TEXT NOT NULL,          -- manual | timer | memoria-activity | cc-session
  source_ref   TEXT,                   -- 冪等キー (memoria event id 群のハッシュ / cc session id)
  confidence   REAL NOT NULL DEFAULT 1.0, -- 観測由来は 1.0 未満
  superseded   INTEGER NOT NULL DEFAULT 0, -- 同日同タスクに manual があれば観測分は合計に入れない
  created_at   TIMESTAMP NOT NULL,
  UNIQUE (source, source_ref)
);
```

| source | 取り方 | 備考 |
|---|---|---|
| `manual` | `POST /api/tasks/:id/work-logs {minutes, logged_on}`。 WebUI のタスクカード + Cc RWF (`✅ 90m` 形式) | 正本。 confidence 1.0 |
| `timer` | WebUI の開始/停止。 停止時に `manual` 相当で書く | 24h 超は自動停止し要確認フラグ |
| `memoria-activity` | 各メンバーの Memoria (個人 PC 常駐) が `activity_events` (`git_commit` / `claude_code_prompt` / `codex_prompt` …) と `app_usage` を日次集計し、 **本人の同意下で** Actio `POST /api/work-logs/import` に「日付・タスク slug 推定・分数」だけを送る | Memoria 側は既存の diary 集計 (`activityEventsForDate` / `appUsageForDate`) を再利用。 生 URL・プロセス名は送らない。 confidence 0.6。 タスク紐づけはコミットメッセージ / ブランチ名の slug (§6.2 と同じ突合) |
| `cc-session` | Cc セッションの `current_task` と開始/終了時刻 | confidence 0.5。 AI 実行時間は「人の稼働」と別集計 (`ai_minutes`) にして混ぜない |

- 表示と集計では `manual/timer` を主、 観測由来は「補完」。 二重計上は `superseded` で防ぐ。
- 個人の稼働は **本人と権限者だけ** が見る。 朝礼 (目標面) にはチーム合計しか出さない。
- Memoria 側に足す物 (Memoria リポの task md): 日次の work-log export ジョブ + 同意トグル + 送信先 (Actio URL / token)。
  Memoria を「タスクのハブ」に戻すのではなく **観測器** としてだけ使う (§0-6 と矛盾しない)。

### 15.4 スプリントのクローズ手順

`PATCH /api/teams/:teamId/sprints/:id {status: closed, carry_over: "next" | "backlog" | "ask"}`

1. 未完了 (`lane=backlog, sprint_id=this, status!=done`) を列挙。
2. `next`: 次スプリント (planning) を無ければ作り `sprint_id` を付け替え、 `carried_from_sprint_id` を記録。
   `backlog`: `sprint_id=null` に戻す。 `ask`: Cc direction 面へ番号付きカード (`C-n`) を出し、 番号返信で個別に決める。
3. `sprint_metrics` (§16.1) を確定 (committed / completed / carried / 実績分 / velocity)。
4. レトロ (§15.5) のスケルトンを作る。

### 15.5 レトロスペクティブ / スプリントレビュー (`sprint_retros`)

```sql
CREATE TABLE sprint_retros (
  sprint_id    TEXT PRIMARY KEY,
  keep         JSON NOT NULL DEFAULT '[]',   -- 続けること
  problem      JSON NOT NULL DEFAULT '[]',   -- 困ったこと
  try          JSON NOT NULL DEFAULT '[]',   -- 次に試すこと (採用したものは daily タスク化)
  review_note  TEXT,                          -- スプリントレビュー (成果物確認) の要約
  source       TEXT,                          -- webui | cc-regular (定例カードの返信取り込み)
  decided_by   TEXT, decided_at TIMESTAMP
);
```

Cc 定例 (`team-review-regular`, 火金 13:00) を Cc に残す判断 (§10) は変えず、 定例カードの返信を
`keep/problem/try` として Actio へ取り込む ingress を Cc 側に足す (§10 Cc 側変更 5)。
LLM は前スプリントの `sprint_metrics` と `problem` を材料に **次スプリント案** (§5) を作る。

### 15.6 チーム設定の追加 (`team_refs.settings`)

```jsonc
{
  "wip_limit_per_member": 2,          // 超過は警告のみ (拒否しない)
  "minutes_per_point": 60,            // story_points を使うチームだけ
  "work_window": ["10:00", "23:00"],  // MyPlan から空き分を出す時間帯
  "dod": ["PR がマージ済み", "動作確認済み", "spec 更新済み"],   // §6.3 の LLM 判定に渡す
  "phase": "prototype",               // §16.2
  "phase_targets": {}                 // §16.2 (省略時は既定表)
}
```

## 16. 稼働実績の定量記録とフェーズ別の調整提案

### 16.1 メトリクスの永続化

```sql
-- 日次 (完了レビュー evening スロットで確定)
CREATE TABLE team_metrics_daily (
  team_id            TEXT NOT NULL,
  metric_date        DATE NOT NULL,
  members_active     INTEGER NOT NULL,   -- work_log か証跡が 1 件以上ある人数
  human_minutes      INTEGER NOT NULL,   -- work_logs (superseded 除く) の合計
  ai_minutes         INTEGER NOT NULL,   -- cc-session 由来 (別集計)
  tasks_done         INTEGER NOT NULL,
  estimate_done_minutes INTEGER NOT NULL, -- 完了タスクの見積り合計 (= 出来高)
  backlog_open       INTEGER NOT NULL,
  daily_open         INTEGER NOT NULL,
  delayed            INTEGER NOT NULL,
  PRIMARY KEY (team_id, metric_date)
);
-- スプリント単位 (close 時に確定、 active 中は on-demand 合成)
CREATE TABLE sprint_metrics (
  sprint_id            TEXT PRIMARY KEY,
  committed_minutes    INTEGER NOT NULL,  -- 開始時の見積り合計
  completed_minutes    INTEGER NOT NULL,  -- 完了分の見積り合計 (velocity の分子)
  carried_minutes      INTEGER NOT NULL,
  human_minutes        INTEGER NOT NULL,  -- 実績
  capacity_minutes     INTEGER NOT NULL,  -- 申告容量
  velocity             REAL NOT NULL,     -- completed_minutes / sprint_days
  utilization          REAL NOT NULL,     -- human_minutes / capacity_minutes
  estimate_accuracy    REAL,              -- Σ estimate / Σ actual (完了分, actual>0 のみ)
  burndown             JSON NOT NULL      -- [{date, remaining_minutes}] 日次スナップショット
);
```

- **平均の出し方**: 直近 4 スプリント (無ければ 28 日) の rolling。 `velocity_p50` と `p25/p75` を持ち、
  Calliope `projecthub-velocity.ts` の「広い信頼帯 + cold-start は申告容量」の流儀を踏襲する。
- **個人別平均** (`member_metrics_weekly`: user_id / week / human_minutes / done_estimate) も持つが
  表示は本人 + 権限者限定。 LLM には匿名 id で渡す。
- `GET /api/teams/:teamId/metrics?range=` と `GET .../sprints/:id/burndown`。

### 16.2 プロジェクトフェーズ

`team_refs.settings.phase` (leader が更新。 自動遷移しない):

| phase | 想定 | 既定の目標値 (`phase_targets`) |
|---|---|---|
| `concept` | 企画・検証 | utilization 目標なし、 スプリント長 1 週、 carried 許容 50% |
| `prototype` | 動く物を出す | velocity 安定より着手数、 carried 許容 40% |
| `production` | 本実装 | utilization 0.6–0.9、 carried ≤ 25%、 estimate_accuracy 0.7–1.3 |
| `polish` | 仕上げ・バグ収束 | 流入 (inflow λ) 監視、 bug reserve を容量から引く (Calliope `capacity.ts` の bugReserve) |
| `release` | 提出・公開前 | 遅延 0 が目標、 スコープ減提案を優先、 新規バックログ追加は警告 |
| `maintenance` | 公開後 | 日常レーン中心、 スプリント任意 |

### 16.3 調整提案 (adjustment engine) — 提案するだけ、 決めるのは人間

`modules/task/adjust/` (純粋関数 + 提案の永続化)。 完了レビュー evening スロットの後に走り、
`sprint_metrics` (on-demand) / `member_availability` / `phase_targets` / 期日 / 残量から **決定論ルール**で
提案候補を作り、 LLM は文章化と質問生成だけ行う (§5.2 と同じ制約)。

| 提案 kind | 発火条件 (既定、 phase_targets で上書き) | 提案内容 |
|---|---|---|
| `reschedule` | 残見積り / velocity_p50 > 残日数 (p80 で red。 §5.3 risk と同じ) | 期日案 (p50/p80 の 2 本) と影響するバックログ項目 |
| `descope` | `reschedule` 条件 かつ phase ∈ {release, polish} | 優先度下位から外す候補列 (見積り分で足し切り) |
| `increase_hours` | utilization < 0.5 かつ declared > 実績 が 2 週続く (申告倒れ)、 または申告合計が残量に足りない | 「週 +N 分で間に合う」の試算。 匿名 id + 分数のみ |
| `add_member` | `increase_hours` で埋まらない (全員 work_window 上限でも不足) | 必要な追加容量 (分/週)。 スキル要件はタスクのタグから |
| `split_task` | 単一タスクの見積りがスプリント容量の 40% 超 / 持ち越し 2 回以上 | 分解案 (LLM, §5.2 `backlog-breakdown`) |
| `phase_shift` | `polish` で inflow λ が 2 週連続低下、 等 | フェーズ更新の打診 (人間が変える) |

- 保存: `adjustment_proposals (id, team_id, sprint_id, kind, inputs JSON, proposal JSON, status proposed|accepted|rejected|expired, decided_by, decided_at)`。
  同じ条件で毎日出さないよう `inputs` のハッシュで 7 日冪等。
- 出口: Cc **管理面** (`delay` カードと同じ権限者限定) に `adjust` カード (kind 追加、 §8.3)。 番号返信で accept/reject。
  accept しても Actio は自動で期日や割付を変えない。 `reschedule` accept → 期日編集画面へのリンク、
  `descope` accept → 外す候補をチェック式で確定、 という **人間の操作を挟む**。
- 朝礼には「提案あり n 件 (管理面)」の件数だけ。

## 17. テスト環境でのデバッグ / シミュレーション

目的: 実 Cc / Revisor / Memoria / Discord に繋がず、 **数週間分のスプリントを数秒で回して** 完了レビュー・遅延・
メトリクス・調整提案の挙動を確認できるようにする。

### 17.1 依存の差し替え点 (実装側の要件)

| 依存 | 本番 | シミュレーション |
|---|---|---|
| 時計 | `Date` | `Clock` インタフェース (`now()`) を repo / scheduler / engine すべてに注入 (Calliope `deps.now` と同じ)。 `SIM_MODE=1` のときだけ `POST /api/_sim/clock {advance: "P1D"}` で進められる |
| 証跡 collector (§6.2) | git / Revisor / Cc | `EvidenceSource` インタフェース。 fixture 版はシナリオが生成したイベントから返す |
| LLM (`claude -p`) | spawn | `LlmPort` を fixture 応答 (JSON) か決定論スタブに差し替え。 本物を使う `SIM_LLM=real` も可 |
| Cc カード送出 (§8.3) | HTTP | `CardSink` をメモリ蓄積にし `GET /api/_sim/cards` で読む。 番号返信は `POST /api/_sim/cards/:id/reply` |
| Memoria import (§15.3) | 各 PC から POST | シナリオが生成した work_logs を直接投入 |
| scheduler | cron | `POST /api/_sim/tick {slot}` で任意スロットを即実行 |

`_sim` ルートは `SIM_MODE=1` かつ `NODE_ENV!=production` でのみマウント。 本番ビルドにはルートを含めない。

### 17.2 シナリオ定義 (`sim/scenarios/*.json`)

```jsonc
{
  "name": "student-team-4w",
  "seed": 42,
  "team": { "phase": "production", "members": [
    { "id": "m1", "role": "leader", "weekly_declared": [600, 480, 600, 300], "reliability": 0.8 },
    { "id": "m2", "role": "member", "weekly_declared": [300, 300, 0, 300],   "reliability": 0.5 }
  ]},
  "backlog": { "count": 24, "estimate_minutes": {"min": 60, "max": 480}, "deadline_spread_days": 28 },
  "daily_inflow_per_day": 0.7,
  "behaviour": {
    "work_log_mode": "memoria",          // manual | memoria | none
    "evidence": "pr_on_done",            // 完了時に PR 証跡を生成 / commits_only / none
    "estimate_bias": 1.3                 // 実績 = 見積り × bias × noise
  },
  "days": 28,
  "events": [ { "day": 10, "kind": "member_absent", "member": "m2", "days": 7 } ],
  "expect": [ { "within_days_of_event": 3, "proposal_kind_in": ["increase_hours", "reschedule"] } ]
}
```

`npm run sim -- --scenario student-team-4w [--llm real]` が:

1. テスト DB (`data/sim-<name>.db`) を作り、 fixture チーム / メンバー / バックログを投入
2. 1 日ずつ `clock.advance` → メンバー行動 (reliability に従って work_log と証跡を生成) → `tick morning` → `tick evening`
3. 各日の `team_metrics_daily`、 出たカード、 提案を `sim/out/<name>/` に JSON + Markdown で吐く
4. 終了時に `expect` 節を検証し、 vitest から同じランナーを呼べるようにする (`tests/sim/*.test.ts`)

- seed 固定で再現可能。 `--llm real` のときだけ非決定。
- WebUI は `SIM_MODE` で同じ DB を見られるので、 進めた状態のボード / バーンダウン / 管理面を目視できる。
- 実データからの再生: `npm run sim -- --replay <team_id> --from 2026-08-01` で本番 DB の
  `work_logs` / `task_reviews` / `sprint_metrics` を読み取り専用でコピーし、 パラメータ (閾値・phase_targets) を
  変えて調整提案だけを再計算する (what-if)。

## 18. 見積り確定で自動生成するガントチャート (2026-08-24 neco 指示)

見積り (`estimate_minutes`) を人間が確定した時点で、 §15 の材料だけからガントを **計算で** 出す。
LLM は使わない (決定論、 シミュレーション §17 でそのまま検証できる)。

### 18.1 スケジューラ (`modules/task/gantt/schedule.ts`, 純粋関数)

入力: バックログ項目 (`estimate_minutes` / `priority` / `blocked_by` / `deadline` / `assignee_id` / `sprint_id`)、
`member_availability` (週次申告 → 日別の可処分分に按分。 MyPlan があれば曜日別の空きで按分)、
チーム設定 (`work_window`, `wip_limit_per_member`, 休日は `holidays` テーブル)、 `Clock.now()`。

1. `blocked_by` で DAG を作りトポロジカル順。 循環は `gantt_errors` として返す (描画はする)。
2. 既存 `modules/pm/analytics/critical-path.ts` を `HOURS_PER_DAY` 固定でなく **人別の日次可処分分**で
   動くよう一般化して再利用 (`calculateCriticalPath` の入力を `TaskForAnalysis` から分単位へ)。
3. 各タスクを担当者の日次可処分分に **優先度順・依存充足順で前詰め** (resource-constrained list scheduling)。
   担当未定は「チーム共有プール」に置き、 最も早く空く人に仮置きして `tentative=true` を付ける。
   同時着手は `wip_limit_per_member` まで。
4. 出力 `GanttBar {task_id, assignee_id|null, start, end, slack_days, on_critical_path, tentative, overdue}`。
   `end > deadline` は `overdue` にし、 §16.3 の `reschedule` 発火条件と同じ数値を使う。
5. 進行中は `actual_minutes` を引いた残りで再計算するので、 実績が入るたびにバーが縮む (バーンダウンと同じ源)。

### 18.2 自動化のトリガ

| きっかけ | 動き |
|---|---|
| `PATCH /api/tasks/:id {estimate_minutes}` / sprint-plan 承認 (§5.1-4) | 同チームの `gantt_snapshots` を再計算し、 WebSocket (`src/ws`) でボードへ push |
| `member_availability` 更新 / `work_logs` 追加 / `blocked_by` 変更 / 期日変更 | 同上 (debounce 数秒) |
| 完了レビュー evening スロット | その日のスナップショットを `gantt_snapshots (team_id, snapshot_date, bars JSON)` に保存 → 「予定 vs 実績」の履歴比較 |

計算は数百タスクで ms オーダーなので同期で良いが、 `sprint_metrics` と同じく **保存は日次だけ**、 画面は on-demand。

### 18.3 表示

- WebUI: `frontend` (React) にガント面を追加。 外部ライブラリを足さず SVG 自前描画 (行 = タスク or 担当者の切替、
  依存矢印、 クリティカルパス強調、 `tentative` は破線、 今日線、 スプリント境界線、 期日マーカー)。
  バーのドラッグは **期日・担当の編集入力**であり、 スケジュール自体は再計算で決まる (手で並べる方式にしない)。
- Cc: 朝礼カードに画像は付けない。 `GET /api/teams/:teamId/gantt.svg` を用意し、 WebUI へのディープリンクと
  「クリティカルパス上で遅れている n 件」の件数だけ書く。
- `GET /api/teams/:teamId/gantt?as_of=&sprint_id=` (JSON) / `.svg` / `.png` (サーバー側 SVG → PNG は
  既存依存に無いので v1 は SVG のみ)。

### 18.4 制約

- 見積りの無いタスクは描かず「未見積り n 件」として上に出す (ゼロ幅で誤魔化さない)。
- 稼働申告が無い週は §15.2 の暫定値 (直近 4 週中央値) で引き、 バーに `provisional` を付ける。
- 実装は T9 の直後 (T9b) に置く: `modules/task/gantt/{schedule,critical-path-adapter,snapshot}.ts` + ルート + React 面。
  §17 のシナリオランナーに `expect: {gantt_overdue_max: n}` を足して回帰させる。

## 19. 最小入力モード — 人間が決めるのは「だれが」「何日」だけ (2026-08-24 neco 指示)

> 「だれがどのタスクを持つかだけ決めて、 何日かかるかを決めたらあとは自動でやってくれるように」

§15–§18 の項目は **内部では全部使う**が、 人間に入力させるのは 2 つに絞る。 他はシステムが導出し、 人間は
「出てきた物を直す」だけにする。 これをチーム設定 `input_mode: "minimal"` (既定) とし、 従来の細かい入力は
`input_mode: "full"` として残す。

### 19.1 入力

| 人間が入れる | どこで |
|---|---|
| **だれが** (`assignee_id`) | ボードのカードにメンバーを置く / Cc RWF `👤 @user` / task md `assignee:` |
| **何日** (`duration_days`) | カードの数字 1 つ / Cc RWF `📅 3d` / task md `days:` |

`tasks.duration_days` (INTEGER nullable) を足す。 **期日 (`deadline`) は必須入力から外す** — §2.1 の
「バックログは期日必須」は `input_mode=full` のときだけの制約に格下げし、 minimal では期日を自動導出する (19.2-3)。

### 19.2 自動で決まるもの

| 項目 | 導出 |
|---|---|
| `estimate_minutes` | `duration_days × 本人の 1 日あたり可処分分`。 可処分分は §15.2 の申告があればそれ、 無ければ直近 4 週の実績中央値、 それも無ければチーム設定 `default_daily_minutes` (既定 120 分 = 学生 / 副業想定)。 導出値は `estimate_source` に記録し、 手で上書きされたら `manual` |
| 開始日・終了日 | §18 のスケジューラが担当者の稼働カレンダーに前詰め。 **duration_days は暦日でなく「本人の稼働日」で数える** (バイト・授業・休日を飛ばす) |
| `deadline` | スケジューラの終了日 = 期日 (`deadline_source=auto`)。 手で入れた期日があればそれを守り、 終了日が超えるときは §16.3 `reschedule` を出す |
| `lane` | `duration_days` を入れたら `backlog`、 入れなければ `daily` (§4 の 2 レーンは維持。 人に選ばせない) |
| `priority` | 依存の深さ (後続が多いほど先) → 自動期日の近さ → 登録順。 手動値があればそれが勝つ |
| `sprint_id` | 開始日が入る期間の active / planning スプリントへ自動所属。 スプリントが無ければ `sprint_length_days` 刻みで**自動作成** (`created_by=auto`)。 §5 の LLM 相談と承認フローは minimal では**任意** (leader が呼んだときだけ) |
| `blocked_by` | 手動入力は残すが必須にしない。 LLM が task 本文から依存候補を出したら `suggested_blocked_by` に置き、 ガント上に点線で出す (確定は人間のクリック 1 回) |
| スプリント容量 | Σ 本人の可処分分。 人間の `capacity_minutes` 入力は不要 |
| 完了 | §6 の完了レビューそのまま (証跡スコア → 閾値以下は判定キュー) |
| 実績 | §15.3 の観測 (Memoria / cc-session) を自動取り込み。 手入力は任意 |
| ガント / バーンダウン / メトリクス / 調整提案 | §16–§18 が全部自動で回る |

### 19.3 登録直後の動き (1 回の入力で完結)

```
カードに 👤 m2 と 📅 3d を入れる
  → estimate 3d × 120min = 360min
  → m2 の稼働カレンダーで 3 稼働日を前詰め: 8/26, 8/28, 8/29 (8/27 はバイト)
  → deadline = 8/29 (auto)、 lane=backlog、 sprint「2026-W35」へ自動所属 (無ければ作成)
  → ガント再計算 → WS push、 8/29 が他タスクの期日と衝突していれば同時に reschedule 提案
  → 以後: 実績が入るたびに残日数で再計算、 evening レビューで完了判定、 遅延なら管理面へ
```

人間が後から触るのは「担当を替える」「日数を変える」「提案を accept/reject する」「判定キューに答える」の 4 つ。

### 19.4 失敗時に人間へ返す条件 (自動で決めない)

- 担当者の可処分分が **0 が 2 週続く** (申告も実績も無い) → 「m2 の稼働が不明」を管理面へ。 期日は暫定 (`provisional`)。
- 自動期日が手動期日 / スプリント終了 / 依存先の開始を越える → `reschedule` / `descope` 提案 (自動で動かさない)。
- 循環依存 → ガントに `gantt_errors`、 登録は通す。
- 担当未指定で `duration_days` だけ入った → 受け付けて `tentative` で仮置き (最も早く空く人)。 朝礼に「担当未定 n 件」。

### 19.5 §12 への反映

- T9 に `duration_days` / `estimate_source` / `deadline_source` / `input_mode` / `default_daily_minutes` を含める。
- T9b (ガント) の「稼働日ベースの日数計算」と「スプリント自動作成」は minimal モードの必須要件。
- §13 受け入れ基準に追加: **担当と日数だけ入れたタスクが、 他の入力なしでガント・スプリント・期日・
  完了レビュー・遅延報告まで一周する** (§17 のシナリオ `minimal-input-2w` で自動検証)。
