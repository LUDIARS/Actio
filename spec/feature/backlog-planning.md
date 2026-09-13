---
type: feature
id: AT-BACKLOG-PLANNING
title: バックログ・スプリント・Pf仕様精査
service: actio
domain: task-modules
updated: 2026-09-13
---

# バックログ・スプリント計画

## 現状照合と移植判断

Actio の基点は `44154381f00f3f58e2463711ff56b4026c4bc06d`。
Memoria の照合 revision は `795f88d4b7bb736ac17dcfe467dc240712737123`。
`DESIGN-memoria-task-port.md` と `spec/feature/team-task/spec.md` を仕様正本として照合した。
Pf は現行 `/api/projects` を読み取り、Actio/Memoria が登録されていないことを確認。
Pf へのプロジェクト新規作成はせず、各 repo の仕様を調査根拠とした。
Anatomia の登録名 `actio` で context を取得。索引保存は EPERM だが結果は取得できた。
Memoria の Anatomia 登録先は本体と異なる worktree のため、移植元は本体ソースを直接照合。

| 機能 | 確認した実装 | 今回の扱い |
|---|---|---|
| タスク/目標、作成主体、カテゴリ、状態互換 | Actio `modules/task/personal.ts`, `routes.ts`, `TasksPage.tsx` | 移植済み。再実装しない |
| 同系統クラスタと適用前確認 | Memoria `server/task-review/types.ts`, `apply.ts` | グループ候補・人間の選択・全内容の fingerprint 確認として移植 |
| 期限未設定タスクの仕分け | Memoria `server/task-triage/types.ts`, `session.ts` | 既存タスク編集・バックログ登録と統合。独立した巡回セッションは未移植 |
| スプリント | Actio `src/db/team-task-schema.ts`、team-task 仕様 | テーブル先行。今回 PostgreSQL/SQLite の運用 API・画面・移行を追加 |
| 担当/完了/期限通知 | Actio `src/lib/task-notifications.ts`, `event-reminders.ts` | 既存経路を保持。Memoria 固有の日次集計 scheduler は未移植 |
| 自動完了レビュー・エージェント実行 | Memoria task-review / agent-run、Cc/Revisor | グループ化で自動完了させない。自動証跡レビュー・実行基盤は今回追加しない |

「今回追加しない」は移植完了を意味しない。依頼全体の未移植項目として残す。
Memoria 本体のデータ・API は変更せず、既存タスクを一括移行しない。

## 操作

`/tasks/planning` で所属チームを選ぶ。バックログは既存 `tasks` の `lane=backlog`。
同系統の候補は同一プロジェクト内のタイトル共通語から提示する。LLM 判断ではなく説明可能な候補であり、
人間が選択して名前・理由を付ける。独立した本文・担当・状態を維持し、重複タスクを勝手に done にしない。
グループ化は表示時の全タスク内容 fingerprint をトランザクション内で再確認する。
並べ替えは全バックログ ID の集合が一致するときだけ適用する。

## スプリントとバッファ

作成時に名前、開始日、締め切り、周期（日）、バッファ上限を必須にする。
開始日 <= 締め切り <= バッファ上限。周期は期間から推測しない。
容量（分/周期）は人間が任意入力し、未設定なら工数からの予測を表示しない。

- planning → active → closed。チーム内の active は1つ。終了後は計画操作を拒否。
- 割付と途中差し込みは同じ API。チーム所属の未完了 backlog のみで、理由必須。
- 終了時の未完了は backlog に戻し `carried_from_sprint_id` を残す。完了タスクは所属を保持。
- 延長は現在の締め切りより後、かつバッファ上限まで。上限超過は 409 とリスケ案内。
- リスケは開始日・締め切り・バッファ・周期・容量を人間が再設定。active の開始日は保存する。
- 稼働中・計画中の他スプリントと重なる変更は、対象名を付けて拒否。後続を先に再計画する。
- `original_ends_on` は上書きせず、すべての操作に理由・判断者・時刻・変更前後を残す。
- 改訂番号による CAS と DBトランザクションで、同時変更と部分適用を防ぐ。

容量からの目安 = 開始日 + ceil(未完了の見積分 / 1周期の容量分 × 周期日数) - 1。
これは一定容量を仮定した計画の比較値で、休日や進捗速度を加味するカレンダー予測ではない。
見積欠落は unknown とし、上限内/バッファ使用/リスケ必要を表示する。個別タスクの期限は一括延長しない。

## Pf 接続と精査

`PRAEFORMA_URL` を Praeforma 本体のサービス所有 `excubitor.catalog.yaml` から解決して
Actio 配備の環境設定へ渡す。ポートはコードに埋め込まない。必要時のみ `PRAEFORMA_TOKEN` を設定する。
Actio のユーザートークンを Pf に転送しない。設定された Pf はこの配備のチーム leader/admin が精査する
共有仕様源である。Pf 側のアクセス権をチームごとに分離する構成は別途必要。
接続先はサーバ設定限定、URL パラメータでホストを指定できず、リダイレクトを拒否する。

Pf の projects / specs / spec detail をページング取得し、版、状態、本文、受入条件を表示する。
担当・期限・見積・精査メモを人間が入力した後、Pf を再取得して内容 fingerprint を照合する。
廃止仕様を拒否し、draft/review はその状態を明示して登録できる。
`source=praeforma-review` と `source_ref=team:project:spec` を冪等キーにする。
同一仕様の再送は既存 ID を返す。登録済みの未完了タスクを明示的に再精査した場合は、タスク側の
fingerprint も照合して同じ ID の要件・見積・期限を更新する。割付済みなら sprint revision を進め、
変更履歴へ記録して影響表示を再計算する。完了済みタスクの上書きは拒否する。
全精査を task_spec_reviews に保存し、版と精査者を plugin_payload に保存する。
通常 API から精査済み参照を書き換えられないようにする。

## API・保存先

`/api/teams/:teamId/planning` を基点とする。

| Method/path | 操作 |
|---|---|
| GET / | backlog、groups、suggestions、sprints と影響 |
| POST /groups、DELETE /groups/:id | 同系統をまとめる/解除 |
| PUT /order | 全 backlog の順序保存 |
| POST /sprints | 初期計画 |
| PATCH /sprints/:id | start/close/assign/remove/extend/reschedule + revision/reason |
| GET /sprints/:id/history | 変更履歴 |
| GET /praeforma/projects | 接続先プロジェクト |
| GET /praeforma/projects/:pid/specs、GET /praeforma/projects/:pid/specs/:sid | 仕様一覧/精査対象 |
| POST /praeforma/projects/:pid/specs/:sid/backlog | 精査済み登録 |

読み取り member、変更と Pf 接続 leader/admin。Cc 経由は既存 requireTeamRole の X-Decided-By を使う。
PostgreSQLを既定とし、計画機能はPostgreSQL/SQLiteに対応。MySQLは501を明示する。PostgreSQLの更新は接続をトランザクションに固定し、チームadvisory lockとタスク行ロックで競合を防ぐ。設定管理と移行手順は runtime-modernization.md を参照。
`src/db/planning-migration.ts` を通常 startup / db:init 共通で呼ぶ。既存 sprints の列を調べて追加する。
履歴行は既存終了日を initial/buffer とし、過去のバッファ承認を捏造しない。

## 検証

型チェックを実施。単体・統合・起動テストはユーザーの明示実行指示が無いため未実行。
`tests/unit/planning-store.test.ts` と `planning-impact.test.ts` に10ケースを追加し、テストコードも型チェック済み。
サービス起動・再起動・デプロイ・データ登録は行っていない。
