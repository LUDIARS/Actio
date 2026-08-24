---
task: 01-team-task-t1-schema-lanes
project: Actio
kind: 実装
status: delegated
created: 2026-08-24T00:00:00.000Z
memoria_task_id: null
actio_task_id: null
---
# チーム別タスク管理 T1 — schema / チーム参照 / 2 レーン / 最小入力バリデーション

## 目的

`spec/feature/team-task/spec.md` の実装フェーズ **T1** (§12) と、 §19 最小入力モードに必要な列を
1 PR で入れる。 以降の T2〜T13 が全部この schema に乗る。 コードを書く前に設計書 §0, §1, §2, §4, §15.1,
§15.2, §16.1, §19 を読むこと。

## 既存との突き合わせ (設計書の列名 → 実コード)

設計書は列名を新規で書いているが、 `src/db/schema.ts` の `tasks` に既にある物は **再利用し、 重複列を作らない**:

| 設計書 | 実コード | 扱い |
|---|---|---|
| `estimate_minutes` | `estimated_minutes` (既存) | 既存を使う。 `estimate_source` (TEXT: manual / derived) だけ足す |
| `priority` INTEGER | `priority` TEXT (low/medium/high/critical, 既存) | 既存 TEXT を維持。 §18 の数値順は repo 層で map (critical=3…low=0) |
| `deadline` | `deadline` (既存 timestamp) | 既存を使う。 `deadline_source` (TEXT: manual / auto) を足す |
| `project_id` | 既存 | そのまま (team_id とは別軸) |

## 完了条件

### schema (`src/db/schema.ts` + `src/db/migrate.ts` + `tests/helpers.ts` の CREATE 文を同期)

- `tasks` 追加列: `team_id` TEXT nullable (index), `lane` TEXT NOT NULL default 'daily', `sprint_id` TEXT nullable (index),
  `source` TEXT, `source_ref` TEXT, `completion_score` REAL, `completion_evidence` JSON, `completed_by` TEXT,
  `duration_days` INTEGER, `estimate_source` TEXT, `deadline_source` TEXT, `story_points` INTEGER,
  `blocked_by` JSON NOT NULL default '[]', `carried_from_sprint_id` TEXT, `actual_minutes` INTEGER NOT NULL default 0。
- 部分 UNIQUE インデックス `(source, source_ref)` WHERE 両方 non-null (設計書 §2.1)。
- 新規テーブル (設計書 §2.2, §15.2, §15.3, §15.5, §16.1 の DDL どおり): `team_refs`, `team_members`, `sprints`,
  `sprint_plans`, `task_reviews`, `task_review_items`, `task_delays`, `member_availability`, `work_logs`,
  `sprint_retros`, `team_metrics_daily`, `sprint_metrics`, `adjustment_proposals`, `gantt_snapshots`。
  drizzle 定義は `src/db/team-task-schema.ts` に分離 (pm-schema.ts と同じ流儀)。 `schema.ts` から re-export。
- migration は既存規約 (冪等 / ALTER 後に INDEX / 全 dialect: `src/db/dialects/{sqlite,postgres,mysql}.ts` で
  型差分があれば吸収)。 既存の個人タスク (team_id=null) は挙動不変。
- `sprints` は `created_by` (TEXT: user_id / 'auto') を持つ (§19.2 自動作成のため)。

### チーム設定

- `team_refs.settings` の既定値を `modules/task/team/settings.ts` に純粋関数 `defaultTeamSettings()` として置く。
  キー: §2.3 + §15.6 + §19 (`input_mode: 'minimal'`, `default_daily_minutes: 120`, `sprint_length_days: 7`,
  `review_slots`, `completion_threshold: 0.8`, `delay_grace_days: 0`, `daily_stale_days: 14`, `standup_enabled`,
  `timezone: 'Asia/Tokyo'`, `wip_limit_per_member: 2`, `minutes_per_point: 60`, `work_window`, `dod: []`,
  `phase: 'prototype'`, `phase_targets: {}`)。 zod で検証。

### バリデーション (`modules/task/validation/team-task.ts`, 純粋関数, 単体テスト付き)

- `team_id != null` のとき `assignee_id` 必須 (§0-3)。 `input_mode=full` かつ `lane=backlog` のとき `deadline` 必須。
  `input_mode=minimal` では `deadline` 任意、 `duration_days` があれば `lane=backlog` に自動設定、 無ければ `daily`。
- `lane` 遷移: `daily→backlog` は `deadline` か `duration_days` のどちらかを伴う。 `backlog→daily` は `sprint_id=null`、 `deadline_source=auto` の期日を落とす。
- `assignee_id` は `team_members` に属すること (repo 経由で確認する関数はここではインタフェース注入)。
- `blocked_by` は同チームのタスク id のみ。 自己参照禁止。

### レーン API (`modules/task/routes.ts` を肥大化させない — `modules/task/team-routes.ts` に分離)

- `GET /api/tasks?team_id=&lane=&sprint_id=&status=` (既存 scope フィルタと併用可)。
- `POST /api/tasks` / `PUT /api/tasks/:id` が `team_id / lane / sprint_id / duration_days / source / source_ref / blocked_by / story_points` を受け付け、 上記バリデーションを通す。
  `source+source_ref` の組は冪等キー (同じ組の再送は 200 で既存を返す)。
- `PATCH /api/tasks/:id/lane {lane, deadline?, duration_days?}`。
- `team_refs` / `team_members` の CRUD は T2 なので**作らない**。 テストでは直接 INSERT する。

### 検証 (機械判定、 PR 説明に結果を書く)

- `npm run typecheck` / `npm test` green。 新規テスト: validation 単体 + team-routes 統合 (tests/api/ 配下)。
- `grep -n "team_id" tests/helpers.ts` が tasks と新規テーブル分ヒットする (テスト DB の DDL が同期されている)。
- `grep -rn "estimate_minutes" src modules` = 0 件 (既存列名 `estimated_minutes` を使っている)。
- 既存テスト (tests/api/tasks*.test.ts 等) が無修正で通る (後方互換)。
- 新規ファイルは coding-conventions (SRP・1 ファイル 1 責務) に従う。 `routes.ts` へ 100 行以上足さない。
- `spec/domains/task-modules.domain.json` に新規ディレクトリ (`modules/task/team`, `modules/task/validation`, `src/db/team-task-schema.ts`) を登録する (Anatomia ドメインゲート)。

## スコープ (編集可)

- src/db/ (schema.ts, team-task-schema.ts 新規, migrate.ts, dialects/)
- modules/task/ (routes.ts 最小変更, team-routes.ts 新規, team/, validation/)
- tests/ (helpers.ts, api/)
- spec/domains/task-modules.domain.json, spec/feature/team-task/code.md (新規: ファイル一覧)

## やらないこと

- Cc 同期 (T2)、 スプリント計算 / ガント (T3, T9b)、 レビュー scheduler (T4)、 フロントエンド。
- 既存 `tasks` 列のリネーム・削除。 Memoria / Calliope への変更。
