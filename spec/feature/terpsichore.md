---
type: feature
id: AT-TERPSICHORE
title: テルプシコラのスクラム判断・実装委託
service: actio
domain: task-modules
updated: 2026-09-26
---

# テルプシコラ

## リポジトリ構成

2026-09-26 の追加指示により、判断機を独立した `Terpsichore` Gitリポジトリへ分離した。
Actioは `lib/terpsichore` のgitlinkでコミットを固定し、`@ludiars/terpsichore` (`file:./lib/terpsichore`) の公開APIを利用する。
判断契約・ルール・Genius/Ccクライアント・単独JSON CLI・判断テストの正本は独立側。
Actio側には認証、DB保存、HTTPルート、画面、Actioのmanifestを参照する委託文を残す。
独立側からActioへのimportはない。ドメインエラーをHTTPへ変換する薄いadapterは `modules/task/terpsichore/guidance.ts`。
単独運用と公開APIは [独立リポジトリのREADME](../../lib/terpsichore/README.md) を参照。

初回取得時は `git submodule update --init --recursive` 後に `npm ci --include=dev` を行う。
Actioのbuild/dev/typecheck/test準備で判断機のJSと型定義を先にビルドし、frontendのbuildでも型定義を準備する。
サブモジュールが未取得なら明示的にビルドエラーになる。判断機をActio内へコピーして代替しない。

`.gitmodules` は `https://github.com/LUDIARS/Terpsichore.git` を指す。ローカルcheckoutから作る審査環境でも、
親リポジトリのoriginに左右されず、公開済みの固定コミットをHTTPSで取得する。非公開リポジトリへの読取権限が必要。
初期構築時のローカルURL設定が残るcheckoutでは、`git submodule sync -- lib/terpsichore` を実行してから取得する。
公開時は独立側のコミットを先に取得可能にし、その後Actioのgitlinkを反映する。

## 役割と既存実装の照合

MUSA processing design（workspace `spec/plan/2026-09-15-musa-processing-design.md` §7H/§8）に従い、
チームの進行とスクラム判断を既存ツールへ薄く接続する。Actio のローカル main `4643179` を基点とし、
`modules/task/planning`、Genius の `/api/clone/query`、Cc の `src/api/delegation.ts` / `src/delegation/partial-requeue.ts` を照合した。
旧 Ars-Musa の Unity コマンドサーバへは組み込まない。

Pf の現行 project 一覧に Actio は無く、Actio の Anatomia context 取得でも利用可能な結果が得られなかったため、
本体の `spec/feature/backlog-planning.md`、`spec/feature/task-integration/spec.md` とソースを根拠とする。
新しい Pf 登録や別タスク正本は作らない。Jev はこの workspace で接続契約を確認できなかったため、
軽量判断の実装先には契約を確認できた Genius を採用する。

## 利用の流れ

`/tasks/planning` でチームと対象プロジェクトを選ぶ。

1. UXゴールに対象利用者・届けたい変化・達成の観測方法を記入する。
2. 既存タスクの目的・受入条件・対象外を定義案として整える。タスク本文への反映は既存の編集経路を使う。
3. 暫定完成と最終UXゴールの到達点に、タスク・前段階・確認シナリオを紐付ける。
4. 最新状況で評価して保存する。スプリントの残容量、依存待ち、定義不足、次の行動を確認する。
5. 必要時にGeniusの判断カードを参照する。
6. 全体バックログを選択した状態で支援計画を保存し、委託候補とCcの実装ワーカーを選んで開始する。
7. 「実行状態と残件を確認」で、Ccの状況とActioの未完了IDを確認する。

自動消化は開始時の固定対象を一つのCc委託で順に処理する。追加タスクを無制限に吸い込む常駐巡回は設けない。
実装タスクは `executorType=ai` かつ `status=open` に限定し、定義不足・循環・取得不能な依存先があるものを外す。
同じ固定対象に含まれる依存元を先に並べ、人間・着手済みタスクの完了待ちは委託へ混ぜない。
別プロジェクトの既知の完了タスクは依存解消として使えるが、そのプロジェクトの作業を委託対象に追加しない。
委託先はタスク開始前にActioを再確認し、他者着手・要件変更・依存未完なら残件として扱う。

## 判断と完了の定義

独立側の `src/backlog.ts` は目的・受入条件・担当・正の工数見積りを点検し、定義案を構成する。
既存本文・requirementsを使い、支援計画の定義案で補足できる。条件が多い場合は分割候補を表示する。
独立側の `src/dependencies.ts` は未取得参照・未完了・取消・循環を区別する。

独立側の `src/checkpoints.ts` は到達点の依存順に評価する。タスクがすべてdoneでも、確認シナリオ・証拠・確認済みフラグが揃わなければ
`verify` とする。証拠には確認時のタスクfingerprintを結び、内容が変われば再確認が必要になる。
チェックを一件だけ付け直した際に、古いfingerprintに対する他の確認済みフラグを引き継がない。
取消は完了ではない。空の到達点・循環・不足したUXゴールを達成として扱わない。
暫定完成とUX達成は別々に判定する。タスク参照が削除・移動された計画も読み込め、参照を修正して再評価できる。

独立側の `src/sprint.ts` はチーム全体の未完了タスクの見積りと、現在から締め切りまでの暦日容量を比較する。
プロジェクト選択で他プロジェクトの容量消費を落とさない。一定の分/暦日を仮定した目安であり、休日・実績消化率は推測しない。
見積り・容量・更新時刻の欠落はunknown、期限超過・阻害・容量超過はat_riskとする。
更新停滞はupdated_atによる目安で、実作業の有無を断定しない。取り消しだけのスプリントをcomplete/on_trackにしない。

通常判断にLLM生成を使わない。Geniusは明示操作につき1リクエスト、`domain=work, visibility=public, k=4` の検索を行う。
送信内容は不足・依存待ち・再計画リスクの件数と判断テーマ。タスク本文・ID・利用者名を送らない。
カードの判断・理由・確度・sourceRefを表示する。未設定・接続失敗は明示的なエラーとし、空結果へ置き換えない。

## Cc連携と永続化

支援計画は `terpsichore_plans(team_id, scope_key, input_json, revision, actor_id, updated_at)` に保存する。
scope_keyはprojectId/sprintIdのJSON組。保存時の全タスク・スプリントfingerprintとrevisionによるCASを使う。
タスク状態やスプリント割付を複製・変更しない。

`terpsichore_runs` は委託ID、team/project/actor、対象task_ids、immutableなmanifest_json、state/run_id/created_atを保存する。
manifestには開始時の計画版・UXゴール・各タスクのfingerprint/依存/受入定義・延期事項を含める。
Ccには認証付きmanifestの参照だけを渡すため、件数や本文を起動プロンプトで切り捨てない。
Ccのproject-code registryで取得したrepo_pathだけをcwdとして使う。利用者に任意のcwd/URLを入力させない。
有効・非call_only・非review_onlyで、task文字列を受け取れる既存テンプレートから選ぶ。
Ccのテンプレートにあるモデル設定を使い、Actioが重いモデルを固定しない。

委託の開始前にDBへ受付意図を保存する。team/projectごとのactive stateに部分UNIQUE indexを設ける。
送信タイムアウトや応答検証失敗はunknownのまま保留し、同じPOSTを自動再送しない。
`triggered_by=terpsichore:<委託ID>` をCcのrun一覧で照合し、曖昧な結果なら保留を維持する。
run一覧はCcの最大500件の範囲で照合する。履歴範囲から外れて確定できない場合はunknownとなり、運用者の照合が必要。
プロセスが送信前に終了してCcにrunが無い場合も、自動で再送・予約解除しない。

Ccがpartialをcompletedとして保存し、残件を別runへ委託する場合は `partial-requeue:<runId>` を辿る。
子runがblockedなら待機として保持する。terminal観測後の古い応答で実行を復活させない。
実行終了とActioのdoneを区別し、Actioに残るIDを画面に示す。自動的にActioをdoneにしない。
認証・manifest取得・レビュー・人間判断で停止した場合はCcの既存手順で残件を引き継ぐ。
テスト実行・サービス操作・push・mergeの追加権限は付与しない。

## API・設定

基点 `/api/teams/:teamId/planning/terpsichore`。既存認証と `requireTeamRole` を使う。

| Method/path | 権限 | 内容 |
|---|---|---|
| GET /plan?projectId=&sprintId= | member | 保存済み計画と最新評価。参照不整合時も計画とwarningを返す |
| POST /assess | member | 保存せず評価 |
| PUT /plan | leader/admin | input/revision/sourceFingerprintを検証して保存 |
| POST /advice | leader/admin | Genius判断カード検索 |
| GET /execution/templates | leader/admin | 利用可能なCc実装テンプレート |
| GET /execution/preview?projectId= | leader/admin | 保存済み計画の版・最新fingerprint・固定対象候補 |
| POST /execution | leader/admin | projectId/callName/planRevision/sourceFingerprintで開始 |
| GET /execution?projectId= | member | 現在の委託とCc状況・Actio残件を照合 |
| GET /execution/:id/manifest | member | 同一チームの委託時定義 |

接続先は `GENIUS_URL` と既存 `CONCORDIA_URL`。各サービス所有のExcubitor catalogから配備設定へ渡す。
Genius認証が必要な構成では秘密設定 `GENIUS_TOKEN` を使用する。Actio利用者トークンを外部へ転送しない。
Ccの接続先は既存Actio連携と同じ信頼済み管理用endpointを使う。redirectを拒否し、Genius8秒・Cc15秒で打ち切る。
PostgreSQL/SQLiteに同じ保存表・一意制約を追加する。通常のplanning migrationに組み込み、MySQLは既存通り501。

## 検証の範囲

独立側の `tests/` に定義不足、循環・他プロジェクト依存、UX証拠の失効、残容量、Cc継続run、Genius送信内容、単独JSON入力の検証ケースを置く。
Actioの `tests/unit/terpsichore-store.test.ts` では保存競合、未確定委託の二重実行防止、チーム境界を確認する。
単体・統合・起動テストは明示実行指示がないため実行しない。実委託、DB migration、サービス再起動、稼働中画面への反映は未実施。

2026-09-26 の静的検証: バックエンド全体と追加テストコードの `tsc --noEmit`、
frontendの `tsc --noEmit -p tsconfig.app.json`、追加した画面とAPIクライアントのESLintが成功。

分離後の静的検証: Terpsichore専用worktreeで依存を個別導入し、単独の `typecheck` と `build` が成功。
Actio専用worktreeでも独立した依存環境を用い、サブモジュールのビルド、バックエンドと保存層テストコードの型チェック、
frontendの型チェックと変更したAPIクライアントのESLintが成功した。テスト実行は行っていない。
