---
task: actio-terpsichore-scrum-engine
project: At
kind: implementation
created: 2026-09-26
memory_links: []
---

# MUSA テルプシコラのスクラム判断とバックログ実装委託

neco の指示: Actio のバックログ定義を補佐し、暫定完成の定義、UXゴールへの道筋、スプリント中の進行管理を支援する。
判断は Jev / Genius などで軽量化する。「実装開始」に続き、Cc の Delegation または Direction でバックログを順次実装して仕上げる指示を受けた。

## 受入条件

- Actio の既存バックログとスプリントを正本とし、別のタスクエンジンを作らない。
- 目的・受入条件・担当・見積りの不足と依存待ちを根拠付きで表示する。
- 暫定完成と最終UXゴールを区別し、タスク完了に加えて現在の成果物でのシナリオ確認・証拠を要求する。
- 到達点の依存、取り消し、循環、未取得参照を完了として扱わない。
- 残作業・残容量・期限超過・更新停滞から次の行動を提示する。
- 通常判断は決定的なルールとし、Genius の既存判断カードを必要時だけ参照する。
- チーム・プロジェクト・スプリント別の支援計画を保存し、他者による更新を上書きしない。
- プロジェクトの未着手AIタスクを依存順で抽出し、Cc の既存Delegationへ固定範囲として委託する。
- 委託対象・判断時の定義を保存し、応答喪失・再読み込み・同時操作で二重委託しない。
- Cc の継続runとActioの未完了件数を追跡し、Ccの実行終了だけでタスクを完了にしない。
- 人間確認待ちを維持し、サービス操作・テスト実行・push・mergeの権限を委託によって追加しない。

設計と運用: [テルプシコラ](../feature/terpsichore.md)

## 追加指示: 独立した判断機として運用

necoの指示により、Terpsichoreを独立Gitリポジトリにし、Actioのサブモジュールとする。
判断契約・ルール・連携クライアントを独立側へ移し、Actioからの逆依存をなくす。
独立側だけで型チェック・ビルドでき、JSONスナップショットを単独で評価する入口を持つ。
Actioは固定コミットの公開APIを利用し、認証・保存・画面の役割を持つ。

## 分離実装の記録

- 独立Git本体: `E:/Document/Ars/Terpsichore`。実装branch: `feat/independent-judgment-engine`。
- 初期抽出commit: `b8eab6eb00903dada67cfa2b58b2531836c1ed9d`。
- Terpsichore local PR #2021はRevisorでTest OKとなり、「マージして続行」の指示でマージ・公開済み。
  Actioのgitlinkは公開済みmain `f9d91b8ba767ee5de611e3fea9bda07ad8737cca` を参照する。
- 独立側の型チェック・ビルド、Actio側の型チェック・変更APIクライアントのlintは成功。セッションによるテスト実行なし。
- Cc project code `Tp` は「OK残作業」の承認を受けて登録済み。
- `LUDIARS/Terpsichore` を非公開リモートとして作成し、独立GitのoriginとCc登録へ反映した。
  Revisorにも独立したレビュー対象として登録済み。初回版管理のbootstrapをRevisorで実施し、コードのremote反映を確認した。
- Cc HTTP 409の原因は、Codex実行ユーザーが作成したcheckoutとCc実行ユーザーの所有者不一致だった。
  今回作成した本体・専用worktreeの3パスだけをGitのsafe.directoryへ追加し、実Gitの検査とCcへの再bindが成功した。
- 独立側の公開済みSHAをremoteのmainと照合してから、Actioの固定参照を更新した。
  Revisorの独立側登録スイートは成功。セッションによるテスト・起動、ActioのDB migration・UX確認は未実施。

## Actio #2025の取得設定修正

Revisorの登録submodules工程でTerpsichoreの取得先がローカルパスとなり、file transport拒否で停止した。
後続のtest/buildも判断機の未取得によりTS5058で停止し、テスト本体は開始できていない。
.gitmodulesを公開済みのHTTPS URLへ固定し、既存checkoutのURL同期手順を更新する。
修正後の登録スイートの結果はRevisorの再審査で確認する。
