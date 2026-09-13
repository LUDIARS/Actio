---
project: Actio
kind: feature
created: 2026-09-13
---

# Actio runtime modernization

neco の 2026-09-13 指示: PostgreSQLを維持しPf等の構成に合わせる。ローカル設定は暗号化configへ置き、Excubitorが解決できる値は注入する。関連するレガシー実装も改修する。

## 設定の責任と優先順位

1. Excubitorの起動環境（明示的な空文字を含む）を最優先する。
2. 暗号化configを読み、未注入のローカル設定だけ補う。
3. 明示選択したInfisical/SSMは外部シークレットの補完に限る。ローカル設定は遠隔キャッシュから読まない。

通常のEx運用は `SECRETS_PROVIDER=env`。古いInfisical設定が親環境に残ってもサービス自身は取得しない。Exのrelay側で必要なキーだけincludeし、古いURL/ポート/ローカルモード値を注入しない。現在のEx実装はsecretがtopologyより優先するため、このinclude設定が必要。

`src/config/local-config.ts` のallowlistが保存可能な設定の正本。DB/Redis接続文字列はローカルconfigに保存できる。JWT・外部APIトークン・Infisical machine identityは保存対象外。サービス間URL、ポート、ログルート等はExのcatalog/topologyを使う。

既定の保存先はWindows `%LOCALAPPDATA%/Actio/config.enc`、他OSは `~/.config/Actio/config.enc`。`ACTIO_CONFIG_PATH` で変更可能。暗号方式はAES-256-GCM、毎回ランダムなsalt/nonce、scrypt鍵導出。Exの暗号化実装の方式を参照したが、推測可能なhostname/usernameを鍵には使わない。`ACTIO_CONFIG_KEY` は32バイト以上を外部から注入し、configと同じファイルには保存しない。鍵不一致・改ざん・指定ファイル欠落は起動失敗となる。

JSONを標準入力から `npm run config:seal` に渡す。旧.envのローカル設定だけ取り込む場合は `npm run config:import-env`。どちらもキー/値をコマンド引数やログに出さず、原本やInfisicalを削除しない。保存は一時ファイルからのrenameで行う。鍵も事前にプロセス環境へ注入する。

## 起動と旧設定画面

`npm start` は `dist/src/bootstrap.js`。設定初期化の完了後にアプリ・DB・Redis・認証を動的importする。ポートはDB接続前に検証する。外部providerを指定したのに設定や初回取得が不足する場合は起動を止める。公開配備のJWT鍵は必須。明示的なローカルモードだけはプロセス寿命のランダム鍵を利用できる。

認証不要の旧setup APIによる.env追記、credential登録、remote接続プローブ、SSM書き込みは廃止（410）。`GET /api/setup/status` は互換維持し、注入運用をsetup不足と誤判定しない。旧GUIは案内に変更。管理者向けの外部secret管理は残し、ローカル設定の登録は400で拒否する。旧env-cliのinitialize候補からローカル設定と固定の開発用パスワードを外した。

## PostgreSQL

DB未指定時はPostgreSQL。未知の方言はエラーとし、SQLiteへの暗黙切替を廃止。`db:init` とdrizzle設定も同じ選択に従う。明示SQLiteは既存の互換用初期化を使う。

計画機能はPfのtransaction-scoped store方式を参考に、既存postgres.js poolを使用する。更新は一つの接続に固定し、チーム単位advisory lockとタスク行FOR UPDATE、revision/fingerprint照合で競合を防ぐ。プレースホルダー、camelCase alias、日時秒数、JSONBを境界で扱う。履歴はevent_orderで同時刻でも登録順を保つ。SQLiteの同期トランザクションをasync callbackに変更せず、互換storeを残す。MySQLの計画機能は501。

tasksの不足列・計画テーブル・PMテーブルは加算的なトランザクションDDLで初期化し、失敗時は接続を解放して起動中止。既存重複は勝手に統合しない。PM repositoryもPostgreSQL用JSONB/timestamp schemaを選び、SQLite変換器を使わない。

## ほかの修正と境界

- Redis設定済みで切断中ならreadinessは503。未設定と区別する。
- Vite proxyはExの `ACTIO_URL` を優先。ファイル監視pollingは明示選択に変更。
- packageの古いSchedula/local-proxy repository情報をActioに修正。
- 予定/カレンダーの大規模改修は既存のSchedula移管方針を守り対象外。これらの旧DDLやMySQL全体の刷新までは完了としない。
- 本体のDB・設定値・稼働プロセスは今回変更していない。レビュー後に本体ビルド、config保存、Ex relay設定、サービス所有catalogの起動口切替が必要。`deploy/excubitor.catalog.example.yaml` が照合用テンプレート。

## 検証

バックエンド・フロントエンド・追加テストソースの型チェックを行う。暗号化configの改ざん/鍵不一致/注入優先順位、PostgreSQL接続スコープ/ロック/rollback伝播の回帰テストを追加。セッション規則によりテスト自体は実行しない。実PostgreSQL上のmigration/同時更新/JSONB往復およびEx起動確認はRevisorと明示許可後の検証事項。
