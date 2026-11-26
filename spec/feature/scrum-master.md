---
type: feature
id: AT-SCRUM-MASTER
title: スクラムマスター (Terpsichore) のフェーズ操作
service: actio
domain: sprint-human-gates
---

# スクラムマスター (Terpsichore)

Actio `actio:b5b5c43c-92fb-44e3-8861-ba89d60d7f62`。neco 2026-11-26「スクラムマスターをTerpsichoreで置くのでそれの権限と判断スキルで回せるように」「スクラムマスター役だけ例外にする」。

## 適用する決定

フェーズ承認・受入承認は AI には役割に関係なく許可しない。ただしリーダーがチームに割り当てたスクラムマスター役の主体は、フェーズ操作に限り許可する。AI メンバーであることは許可の根拠にしない。

## 担当の分かれ目

| 担当 | 持つもの |
|---|---|
| Actio | 役割の割当、主体の認証、チーム境界、版の照合、サーキットブレーカー照会、状態と履歴の保存 |
| Terpsichore (独立リポ、`lib/terpsichore`) | フェーズの遷移条件 (`decideSprintPhase`) と状況の評価 (`assessGuidance`) |
| workspace の MUSA Terpsichore スキル | 各フェーズで進めてよいかの判断手順と、操作の実行 |

Actio は判断ロジックを持たず、役割のための判断材料 API も追加しない。判断材料は既存の `GET .../planning/sprints/:id/phase` (対象全タスク、状態、受入条件、完了証跡、実行者種別、版、履歴、次計画) と `GET .../planning/terpsichore/plan?sprintId=` (停滞・期限超過・依存待ち・受入定義の不足・到達点の確認状況) を使う。

## スクラムマスターの役割と権限

- チームごとに一つの役割。担当は `terpsichore`。チームリーダー、Actio 管理者、ローカルモードの持ち主が付け外しする。`X-Decided-By` を使うサービス経路は付け外しできない。
- 担当する主体は割当時に決める。`clientId` が無ければ Actio と同じ PC の AI セッション、指定した場合は `scrum-master` scope を持つ有効な API クライアントだけ。API クライアントは操作者本人が所有するものに限る (管理者を除く)。
- `team_members` の役割や AI メンバー登録は、フェーズ操作の根拠にしない。
- 自律モード ([自律スプリント](./autonomous-sprint.md)) とは併用しない。一方があるチームでは他方の登録を 409 にする。

| メソッドと相対パス (`/api/teams/:teamId/planning/scrum-master`) | 権限 | 入出力 |
|---|---|---|
| GET | チーム member | `{assignment, canManage}`。`assignment` は `holder, delegate (local-session / api-client), assignedBy, assignedAt` |
| PUT | リーダー / 管理者 / 持ち主 | `{clientId: string \| null}` |
| DELETE | 同上 | 割当が無ければ 404 |

## スクラムマスターの認証と判断主体

要求は `X-Actio-Scrum-Master: terpsichore` を付けて役割を名乗る。

- この PC の AI セッション: loopback から直接届き、`X-Actio-AI-Session` に英数・`_`・`-` の 128 文字以内のセッション ID を付ける。トンネル経由は受け付けない。
- API クライアント: `X-API-Client-ID` / `X-API-Client-Secret`。既存の Ingress のアクセス制限を経由する。
- 名乗った要求の書き込みは、下のフェーズ操作二つに限る。タスクの更新・完了、役割の付け外し、ほかの API は 403。
- フェーズ履歴とスプリントの承認者は `scrum-master:terpsichore`。実行したセッションまたは API クライアントは `sprint_scrum_master_events` に残し、回答 ID でフェーズ履歴と対応付ける。回答 ID の名前空間は `sm:`。

ローカルモードは持ち主一人の配備で、同じ PC から届く要求が人か AI かを暗号的には区別できない。名乗りは AI の操作経路を人の経路と分け、権限を狭め、監査に残すための契約である。AI はフェーズ操作を名乗らずに行う経路を持たない (人間向け経路はローカルモードを 403 にする)。

## スクラムマスターのフェーズ操作

[手動ゲート](./sprint-human-gates.md) と同じ URL・同じ版照合・同じ transaction を使う。

| 操作 | 内容 |
|---|---|
| GET `.../sprints/:id/phase` | 現在の状態と対象全件 |
| PUT `.../sprints/:id/phase/context` | 振り返りと次スプリントの指定 |
| POST `.../sprints/:id/phase/decisions` | `approve` (計画開始・受入承認・振り返り確定・次計画承認)、`reject`、`resubmit`、`hold`、`resume` |

- `expectedRevision` と `sourceFingerprint` が古い判断は 409。結果不明の再送は同じ `eventId` と同じ内容にする。
- 開始を伴う承認 (計画開始と次計画承認) は、反映の前に既存の `CONCORDIA_URL` へ自律スプリントと同じサーキットブレーカー照会をする。遮断は 409、未設定・接続不能は 503 で、状態と回答を保存せず `breaker_open` / `breaker_unavailable` を監査に残す。照会後に開始効果へ変わった版は transaction 内で 409 にする。
- 人が保留したスプリントは、人が解除するまでスクラムマスターの全操作を 409 にする。スクラムマスター自身の保留は自分で解除できる。
- 割当と資格情報は判断と同じ transaction で照合する。取り外し・失効の後は保存済みの回答も返さない。

## 人の結果が必要なタスク

人の試遊のように人の結果が必要なタスクは `executorType=human` で登録する。スクラムマスターはタスクを更新できず、受入承認は対象全件が `done` のときだけ成立する (Terpsichore の完了条件)。そのため人が完了にするまで受入確認へ進めない。

名乗らない loopback の書き込みは Actio からは持ち主の操作に見える。AI セッションが人のタスクを完了にしないことは、Terpsichore スキルと委託側の作業規則で守る。AI が実装するタスクは `executorType=ai` にして区別する。

## 手動運用との共存と切り戻し

- 割当後も人は従来どおり Actio の画面と Cc の判断カードで操作できる。先に反映された判断が版を進め、後の判断は古い版として拒否される。
- 止めるときは対象スプリントを保留する。役割ごと止めるときは割当を外す。外すと即座に全操作が 403 になり、スプリントは現在のフェーズから人の判断で続く。
- コードを戻す場合も追加した二つの表は残してよい。フェーズ状態と履歴は既存の形のままで、旧版が読める。

## 自動で周回する条件

Actio は定期処理で役割の判断を起動しない。周回は、フェーズが変わった通知や定期実行で Terpsichore スキルを動かす側が担う。次スプリントは同じチームの後の期間の `planning` スプリントを `context` で指定し、無ければ作成するまで `next_planning` で待つ。スプリントの作成・割付は役割の権限ではなく、既存の計画 API の権限で行う。

## スクラムマスターの保存データ

SQLite / PostgreSQL の加算 DDL。`sprint_scrum_masters` (チームごとの割当、API クライアントは内部 ID)、`sprint_scrum_master_events` (割当・解除・判断・遮断の種別、実行主体 ID、回答 ID、時刻)。個人の属性・秘密・トークンは保存しない。

## C++ 移行

Node の backend が所有する。[C++ 移行](./portus-backend.md) の段階 6 の前に、役割 API、名乗った要求の書き込み制限、フェーズ操作の委任条件を移す。
