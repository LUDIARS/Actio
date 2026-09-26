# スプリント各フェーズの人間介入

## 要求と状態所有

Actio が計画・実装・受入確認・振り返り・次計画の正本を持つ。Terpsichore の独立パッケージが純粋なフェーズ判断を返し、Concordia がスプリント会話・配送・Discord 本人入力を所有する。Cc run の完了は実装完了を証明しない。

## スプリントフェーズの不変条件

- スプリントに所属する全プロジェクト・全レーン・取消を含むタスクを取得して照合する。空・取消・一部取得を完了扱いしない。
- 差し戻しは同じスプリントに rework 対象を残し、task status・日付・割付・次スプリントを変更しない。人間の明示再提出まで同じ done 情報で再び受入確認へ入らない。
- 計画開始、受入承認、振り返り確定、次計画承認は本人の明示判断を要する。保留解除は承認と別操作。古い revision / fingerprint は拒否する。
- 次計画は既存の別の planning スプリントを明示選択する。ゴール・期間・容量・未完了対象が揃い、現スプリントの受入・振り返りを経た承認時だけ現終了と次開始を一つの transaction で反映する。未達タスクを勝手に持ち越さない。
- 旧 sprint PATCH start / close はフェーズ承認を迂回できず 409。update_goal は未完成計画を補完できる。
- 既存 active 行は implementation から復元し、過去の人間承認を捏造しない。closed 行は編集しない。終了した会話は closed=true で判断ボタンを無効化する。

## スプリントフェーズの本人認証

直接 API は Cernere の人間セッションを要求する。api_client の X-Decided-By、anonymous、actio-local / local mode は人間の承認証跡に使わない。閲覧は既存チーム member 権限に従う。

Cc の人間イベントは外部から作成できない Cc キューをポーリングする。Discord 本人 ID は Cernere project WS managed_project.resolve_user_by_claim(claim=discord_id) で逆引きし、Actio の team leader を transaction 内で検証する。Cernere 管理者が Actio project の identity_claims に discord_id を許可する必要がある。未連携・資格情報不足・接続不能は明示的な未反映理由と Actio ログイン導線を返す。Actio に Discord ID、表示名、トークンを保管しない。

## スプリントフェーズの永続化と復旧

SQLite / PostgreSQL の加算 migration は sprint_gates、sprint_gate_history、sprint_gate_outbox、sprint_gate_events を用意する。フェーズ CAS・sprint status 効果・正確な履歴 snapshot・通知意図・event outcome は一つの transaction。SQLite は同期 generator interpreter と immediate transaction、PostgreSQL は既存チーム advisory lock と短い tasks table lock で scope の追加・移動 phantom も除外する。配送・event lookup 等の bookkeeping は tasks lock を取らない。DB transaction 内にネットワーク処理を置かない。

## スプリントフェーズの通知と受信

通知は commit 後に Cc の同一 dialogueKey/revision へ PUT する。Cc 応答喪失は unknown とし、同じ保存済み payload で照合可能な再送をする。表示要約は 24000 文字以内の明示的抜粋とし、全 taskIds と fingerprint は保持する。人間回答は UI/Cc ごとに namespace を持つ event ID で重複排除し、永続 outcome commit 後だけ Cc ACK を送る。ACK 喪失後も同じ outcome を再返却する。過去イベントは後からの内容変更を受け付けない。

## スプリントフェーズのAPIと画面契約

- GET /api/teams/:teamId/planning/sprints/:id/phase: 現 snapshot・phase state・history・delivery・allowedToDecide。
- PUT 同 /phase/context: expectedRevision、sourceFingerprint、reason、retrospective、nextSprintId。
- POST 同 /phase/decisions: 同 snapshot guard と eventId、action (approve/reject/hold/resume/resubmit)、taskIds。
- stale / 権限外 / 未達の回答は進めず理由を表示。通信結果不明の再試行は同じ ID と同じ内容に限る。

## 検証境界

回帰ケースは tests/unit/sprint-gate-store.test.ts と sprint-gate-worker.test.ts に宣言する。実装中は静的型チェック・ビルドのみを行い、テストは Revisor 登録実行に委ねる。実サービスの起動、Discord 会話の作成、本人連携・UX 確認は配備後の別の動作確認を要する。

受入確認以降のゴール変更は旧 PATCH 経路でも拒否し、人間の明示差し戻しで implementation へ戻してから変更する。タスク fingerprint だけが同じことを根拠に、新しいゴールを過去の受入済み成果へすり替えない。
