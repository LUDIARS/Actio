# 実装確認の検証記録

2026-09-27。ユーザーの「実装状況は Actio タスク／バックログで管理」「タスク完了→人間確認→完了」
「バックログ追加で差し戻し」「仕様変更で状態が変わる」という指示を実装した。検証は既に明示許可を得ている。

起点: ローカル main `29f0b81`。専用 worktree `feat/praeforma-implementation-review`。
共有 checkout の未コミット変更は編集していない。
対応する Pf の worktree は `feat/scenario-experience-overlay`。両リポジトリの連携仕様を合わせて配備する必要がある。

成功した確認:

- backend と frontend の `tsc --noEmit`。
- frontend の Vite 本番 build。大きな chunk と既存 `__dirname` 設定の警告は残る。
- 変更した frontend 3 ファイルへの ESLint。
- implementation-review 4 件、implementation-routes 4 件、既存 planning-store 7 件、planning-postgres 2 件の計 17 件。
- インメモリ SQLite による確認履歴・タスク再開・残件バックログ・仕様変更・チーム境界・削除・DDL 再適用。
- サービス読み取り経路で API client headers とチーム所属を要求し、サービスからの人間確認を拒否。

未確認／未実施:

- 実 PostgreSQL に対する新 DDL・trigger の適用（planning-postgres の 2 件は既存 adapter のトランザクション試験）。
- ログイン済みブラウザでの実操作と Pf↔Actio の実サービス連携。
- 起動・再起動・配備・実データ変更・push・Revisor 提出・merge。

Lictor CLI で main と作業 branch の task 登録を試したが、両方とも `LICTOR_PORT not set`。
自セッションの接続情報を推測せず、Cc 状態記録と審査提出は未実施のまま保持する。
ブラウザ runtime の利用可能インスタンスも 0 件。これらは検証許可不足による保留ではない。

## PR #2090 の競合解消（2026-09-27）

- neco の「直して」に従い、ローカル main `350f9b6` へ rebase。
- SQLite の planning migration は実装確認 DDL・trigger と main 側の chat DDL を両方保持。
  PostgreSQL 側の自動統合でも両方の DDL が残ることを差分確認した。
- implementation-review / implementation-routes / planning-store / planning-postgres / chat-intake の
  5 ファイル・20 テスト成功。Cc testing claim/release 実施、サービス起動・実 DB 変更なし。
- `git diff --check` 成功。実画面・実 PostgreSQL migration は引き続き未確認。
- 対応 Actio タスク: `59407d5a-c07f-440f-bf80-ea6877c9d87e`。
