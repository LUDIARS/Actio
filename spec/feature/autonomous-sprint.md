---
type: feature
id: AT-AUTONOMOUS-SPRINT
title: 自律スプリントと dots 管制
service: actio
domain: autonomous-sprint
---

# 自律スプリントと dots 管制

Actio `actio:c37893d0-b57f-403c-9331-ac047897c107`（委託参照 `actio:5a13e7c9-7f80-423c-8dfe-0be264a42b6b`）。

## 自律スプリントの参加と進行

- 既定は手動運用。Cernere でログインしたチームリーダーまたは Actio 管理者が、保留されていない計画中のスプリントを選んで参加を登録する。1 チームに同時に 1 ループ。登録時に有効な dots 用 API クライアントを結び付ける。
- Actio の定期処理が現在の全タスクを照合し、計画から実装、受入、振り返り、次計画へ進める。空のスプリント、取消、未完了タスクを完了扱いしない。進行に使った版と理由を履歴に保存し、判断主体は自律ループとして記録する。
- 振り返りに対象件数と完了状況を記録する。dots が方針に明示した次スプリントは、同じチームの、現スプリントより後に始まる計画中のスプリントに限定する。現スプリントの終了、次の開始、同一ループの対象切替は一つのトランザクションで行う。次計画が未指定の場合は待機する。
- 状態には実タスクの進行状況、停滞判定（更新時刻と設定した分数）、最終警告および着手許可を返す。着手許可は 1 件ずつ発行する。対象は同じスプリント内の定義・プロジェクト・担当が揃った未着手 AI タスクに限り、依存先の完了も確認する。
- dots が作業を起動・追跡する。着手許可 ID を dots 側の起動の重複排除キーとし、応答を失った場合は GET で既存の許可を確認する。完了は通常の Actio タスク更新で記録する。取消・移動を検知した既存許可は自動解除せず、照合を待つ。停滞は警告し、同じ許可からの再起動は行わない。
- 一時停止は新規進行と着手許可を止める。実行中の作業を止める場合は dots が作業先で介入する。照合は一時停止中に行い、作業が残っていないことを確認して理由を記録する。手動運用への切り戻しは一時停止中で未照合の許可がない場合に行う。

[スクラムマスター役](./scrum-master.md) を割り当てたチームは自律モードに登録できない (409)。自律モードのチームには役割を割り当てられない。判断する AI をチームごとに一つに保つためで、切り替えは片方を外してから行う。役割の方式は段階ごとに AI が判断し、自律モードは登録後に条件が揃えば定期処理が進める。

## 自律スプリントの管制 API

基点は `/api/teams/:teamId/planning/autonomous-sprint`。

| メソッドと相対パス | 認可 | 入出力 |
|---|---|---|
| GET / | チーム member | `{run, canManage}`。ループ未登録時は `run: null` |
| POST / | Cernere で認証した leader/admin | `sprintId, clientId, stalledAfterMinutes?`。リーダーは自身が所有する API クライアントを指定 |
| POST /:sprintId/pause | 同上 | `expectedRevision, reason` |
| POST /:sprintId/reconcile | 同上 | `expectedRevision, reason` |
| POST /:sprintId/release | 同上 | `expectedRevision, reason` |
| GET /dots | 登録済みの dots キー | `{run}`。ID、対象スプリント、周回、版、進行、次計画、振り返り、タスク ID・プロジェクト・状態・実行者種別、許可 ID、警告 |
| POST /dots/control | 同上 | `action, expectedRevision, reason`。操作は `policy`（`nextSprintId` または null と `stalledAfterMinutes` を指定）、`pause`、`resume`、`intervene`、`reconcile` |
| POST /dots/claims | 同上 | `expectedRevision, taskId`。許可時 201 と `{claimId, taskId}` |

dots は専用の `autonomous-sprint` スコープと `X-API-Client-ID` / `X-API-Client-Secret` を使う。既存の API キー管理で専用キーを発行できる。チーム、登録済みクライアントの内部 ID、要求版を照合し、別チーム・別キーや本人を自称するヘッダーで管制できない。このスコープでタスク本文へアクセスしたり、タスクを編集したりする権限は付与されない。Ingress の既存アクセス制限を経由する。環境変数の追加はない。

## 自律スプリントの遮断と復旧

初回スプリント開始、新規タスクの着手許可、次スプリント開始の直前に、既存の `CONCORDIA_URL` へ `POST /v1/autonomous-loop/circuit-breaker/check` を送る。送信内容は `{"source":"actio_sprint"}`。HTTP 200 で許可、409 で遮断し、未設定、タイムアウト、リダイレクト、その他の応答は許可未確認とする。通信はトランザクション外で行い、問い合わせ後にループ ID・版と対象を再照合する。HTTP 409 は `breaker_open`、未確認は `breaker_unavailable` として永続化する。既発行の許可は保持する。

## 検証

単体テストの対象は、手動運用からの隔離、永続化・再開、サーキットブレーカー、同時更新、dots の権限とチーム境界、取消を含む全タスク照合、同一トランザクションでの次周回。SQLite と PostgreSQL は同じ加算 DDL とクエリを使う。
