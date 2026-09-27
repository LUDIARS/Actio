# Pf の実装状況と人間確認

2026-09-27 neco 指示: 実装状況は Actio のタスク／バックログで管理する。
タスク完了 → 人間確認 → 完了。確認で見つかった残件はバックログ追加で差し戻し、仕様変更は再確認にする。

## 正本と状態

タスクの実行状態は既存 `tasks` が正本。Pf は仕様、シナリオ、シーンを保持し、Actio の判定を読み取って表示する。
Pf の実装根拠やテスト合格だけでは人間確認済みにしない。関連付けは仕様／シナリオごとで、同じタスクを複数対象に関連付けられる。

| 状態 | 条件 |
|---|---|
| unregistered | 対象タスクなし |
| specification_changed | 現行仕様の fingerprint に関連付いたタスクなし |
| in_progress | 未完了タスクあり |
| returned | 追加バックログに未完了タスクあり |
| awaiting_confirmation | 現行仕様の作業を含め全タスク done、人間確認なし |
| completed | 現行仕様と対象タスクの版に対する人間確認あり |

取消・削除・別チームへ移動したタスクは完了とみなさない。通常のタスク更新経路から `done` にしても人間確認待ちになる。
仕様が変わったときは既存の done を書き換えず、追加作業をバックログへ登録するか既存タスクを現行仕様へ明示的に関連付け直す。
過去の完了タスクを履歴として残し、現在の版に対する差分タスクが完了した後に再び人間確認する。
関連付けたタスクの削除は未解決扱いであり、リンクを黙って消して完了へ進めない。

確認にはチーム leader または admin の人間ログインが必要。サービスの代理ヘッダーや匿名ローカルモードは人間確認に使えない。
画面は `canConfirm` に従って確認操作を無効にする。追加バックログは既存タスクと同じ担当者・期限・見積を持ち、チーム内の担当者のみを許可する。

## API と画面

チームの計画画面 →「Pf の仕様を精査してバックログへ登録」→ プロジェクト選択 →「仕様・シナリオの実装状況と人間確認」。

ベース: `/api/teams/:teamId/planning/praeforma/projects/:pid/implementation`

- `GET /`: 現行仕様とタスクから状態を投影。team member 以上。
- `GET /service`: 同じ読み取り。既存 API クライアント認証（`X-API-Client-ID`, `X-API-Client-Secret`, tasks scope）と `X-Decided-By` のチーム所属を確認。
- `POST /:kind/:id`: leader 以上。kind は spec/scenario。action は link/backlog/confirm。取得時の fingerprint と理由 note を必須とする。
- link: taskId。backlog: title/assigneeId/deadline/estimatedMinutes。confirm: 人間本人の認証が追加で必要。

各操作前に `PRAEFORMA_URL` の `/api/projects/:pid/review-overlay/manifest` を `PRAEFORMA_TOKEN` で読み直す。
URL はサービス所有の Excubitor catalog から設定し、リクエストから任意ホストを受け取らない。
Pf の orgId と Actio の teamId の一致も検証する。旧 Pf、接続失敗、所属不一致を空の成功結果にしない。
Pf 側と Actio 側の変更を合わせて配備する。実行中サービスの設定・DBはこの作業で変更しない。

## 競合と責務

`contracts.ts` は境界検証、`state.ts` は状態判定、`store.ts` は永続化、`routes.ts` は認可と Pf 取得を担当する。
既存の planning repository と SQLite/PostgreSQL transaction interpreter を利用する。ネットワーク待ちは DB トランザクションに含めない。
仕様とタスクの fingerprint が画面表示時から変わっていたら 409。バックログ追加と関連付けは同一トランザクションで行う。
PostgreSQL は既存 planning のタスク書き込みロック、SQLite は immediate transaction を使う。
仕様が取得直後に変わった場合も、次回読み取り時に確認版の不一致として検知する。サービス間の分散トランザクションは導入しない。

検証: `tests/unit/implementation-review.test.ts`、`implementation-routes.test.ts`、既存 planning-store/planning-postgres。
SQLite の状態遷移、同一秒内の再開、追加バックログ、仕様変更、所属境界、取消・削除、DDL 再適用を検証する。
実 PostgreSQL の migration とログイン済み実画面は別途確認が必要。
