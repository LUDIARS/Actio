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

JSONを標準入力から `npm run config:seal` に渡す。キー/値をコマンド引数やログに出さず、Infisicalを削除しない。旧設定ファイルからの移入コマンドと生成ツール (env-cli / setup スクリプト / dotenv-cli) は2026-09-21に撤去し、catalogの起動口も `dist/src/bootstrap.js` へ切り替えた。保存は一時ファイルからのrenameで行う。鍵も事前にプロセス環境へ注入する。

## 起動と旧設定画面

`npm start` は `dist/src/bootstrap.js`。設定初期化の完了後にアプリ・DB・Redis・認証を動的importする。ポートはDB接続前に検証する。外部providerを指定したのに設定や初回取得が不足する場合は起動を止める。公開配備のJWT鍵は必須。明示的なローカルモードだけはプロセス寿命のランダム鍵を利用できる。

認証不要の旧setup APIによる設定ファイル追記、credential登録、remote接続プローブ、SSM書き込みは廃止（410）。`GET /api/setup/status` は互換維持し、注入運用をsetup不足と誤判定しない。旧GUIは案内に変更。管理者向けの外部secret管理は残し、ローカル設定の登録は400で拒否する。旧env-cliのinitialize候補からローカル設定と固定の開発用パスワードを外した。

## 初回設定画面 (2026-09-21 追加)

neco の 2026-09-21 指示: 設定されていない場合は初回設定画面にする。形は「ローカル限定で入力可」。旧GUIの案内ページはこの画面に置き換えた。

- **判定**: 注入値と暗号化configを適用した後も、URL方言 (postgres / mysql) の `DATABASE_URL` が空なら未設定。判定は `src/setup/setup-state.ts` の1か所に置く。JWT等のsecret不足は対象外で、従来どおり起動失敗。
- **対象**: `ACTIO_LOCAL_MODE=1` のローカル配備だけ。公開配備の設定不足は起動失敗のまま (画面で補わない)。
- **動作**: `bootstrap` は本体 (DB・認証) を読み込まず、同じポート・loopbackだけで設定用の最小サーバー (`src/setup/`) を待ち受ける。`/api/health` は `needs_setup` で503、`/api/setup/status` は `needsSetup: true` と不足キー・保存可否を返し、それ以外は503。無言の劣化ではなく、Excubitorからは未設定として観測できる。
- **保存**: `POST /api/setup/local-config`。受け付けるのはソケットがloopbackでproxyヘッダの無い直接アクセスだけ (`allowsLocalRequest`、Cloudflare経由とLANは403)。キーは `DB_DIALECT` / `DATABASE_URL` / `DATABASE_PATH` / `REDIS_URL` に限り、secretは拒否する。接続URLはprotocolを検証し、値はログにも応答にも出さない。既存の暗号化configの他キーは保持する。
- **鍵**: `ACTIO_CONFIG_KEY` が未注入なら保存は409で、画面にその旨を出す。鍵を画面から受け取ることはしない。
- **引き継ぎ**: 保存後は待受を閉じてポートを解放し、同じプロセスで本体を起動する (Excubitorでの再起動は不要)。空文字の注入が保存値を上書きして未設定が続く場合は、画面では直せないので起動失敗にする。
- 9/13に廃止した旧setup API (credential登録・remoteプローブ・SSM書き込み・設定ファイル追記) は410のまま。復活させたのは上記のローカル設定保存だけ。

## secret の取得元 (2026-09-21 追加)

neco の 2026-09-21 指示: 暗号化configに「Infisicalから値を取得する」設定を持たせ、初回設定で設定させる。接続情報はExcubitorから渡す。経路は「Exにマッピング登録 + secret-agent」。

- **誰が何を持つか**: Infisicalのmachine identityはExcubitorだけが持ち、Actioへは渡らない (Excubitorは意図的に子へ継承させない)。Actioの暗号化configが持つのは取得元の指定だけ — `ACTIO_SECRET_PROJECT_ID` / `ACTIO_SECRET_ENVIRONMENT` / `ACTIO_SECRET_KEYS`。旧 `INFISICAL_*` とは別名にした (catalogが空文字で固定しており、保存値が上書きされるため)。
- **受け取り**: 起動時に `src/config/excubitor/secret-agent-client.ts` がExcubitorのsecret-agent (`POST /api/v1/secrets/resolve`、service=`actio`、loopback + token) へ問い合わせる。Excubitorの場所は注入される `EXCUBITOR_URL` だけを使い、ポートをActioに書かない。tokenは `EXCUBITOR_AGENT_TOKEN` かExcubitorのtokenファイルを読むだけで、Actioは保存しない。値は `secretManager` のメモリキャッシュにだけ置き、環境変数にもファイルにも書かない。優先順位は従来どおり 注入値 > 暗号化config > 受け取ったsecret。
- **照合**: 応答の `project_id` / `environment` が保存した取得元と一致しなければ受け取らない。指定したキー以外も捨てる。ローカル設定キー (URL・ポート・ローカルモード等) は取得キーに指定できない (2026-09-13の衝突の再発防止)。
- **失敗時**: 取得元が設定されているのに受け取れない場合は起動を止める (secret無しで黙って動かさない)。エラーは分類だけを扱い、上流のメッセージや値を画面・ログへ出さない。
- **初回設定画面**: 「Infisicalから受け取る」と「接続先をここに入力する」を選べる。前者は取得元を保存した後にその場で受け取りを試し、`DATABASE_URL` が届いて初めて本体を起動する。Excubitor側にマッピングが無い (`no_mapping`) ・別projectを指している (`source_mismatch`) 場合は、保存は残したまま画面に直し方を出す。
- **Excubitor側のマッピング**: 初回設定画面で保存すると、`src/config/excubitor/mapping-client.ts` がExcubitorの1サービス分だけを差し替える口 (`PUT /api/v1/config/infisical/services/actio`、Excubitor側で2026-09-23に追加) へ同じ内容 (project_id / environment / include、inject=false) を登録してから受け取りを試す。マップ全体を置換するUI用APIは使わない (他サービスの行を消せるため)。その口が無い古いExcubitor (404) では `mapping_unsupported` を返し、Config画面での手動登録を案内する。

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
