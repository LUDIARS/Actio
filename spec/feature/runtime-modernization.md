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
3. Vault secret-agent / SSMは外部シークレットの補完に限る。ローカル設定は遠隔キャッシュから読まない。

通常のEx運用は `SECRETS_PROVIDER=env`。secretはExのVaultに登録・紐付けし、必要なキーだけを注入する。非secret設定はサービス所有catalogの `env:` に置き、URL/ポートはtopologyで管理する。Ex内の優先順位は topology < catalog env < 暗号化runtime config < Vault。Actio内では上記の注入優先順位を維持する。

`src/config/local-config.ts` のallowlistが保存可能な設定の正本。DB/Redis接続文字列はローカルconfigに保存できる。JWT・外部APIトークン等のsecretは保存対象外。サービス間URL、ポート、ログルート等はExのcatalog/topologyを使う。

既定の保存先はWindows `%LOCALAPPDATA%/Actio/config.enc`、他OSは `~/.config/Actio/config.enc`。`ACTIO_CONFIG_PATH` で変更可能。暗号方式はAES-256-GCM、毎回ランダムなsalt/nonce、scrypt鍵導出。Exの暗号化実装の方式を参照したが、推測可能なhostname/usernameを鍵には使わない。`ACTIO_CONFIG_KEY` は32バイト以上を外部から注入し、configと同じファイルには保存しない。鍵不一致・改ざん・指定ファイル欠落は起動失敗となる。

JSONを標準入力から `npm run config:seal` に渡す。キー/値をコマンド引数やログに出さない。旧設定ファイルからの移入コマンドと生成ツールは撤去済みで、catalogの起動口は `node dist/src/bootstrap.js`。Actioは `.env` を読まない。保存は一時ファイルからのrenameで行う。鍵も事前にプロセス環境へ注入する。

## 起動と旧設定画面

`npm start` は `dist/src/bootstrap.js`。設定初期化の完了後にアプリ・DB・Redis・認証を動的importする。ポートはDB接続前に検証する。外部providerを指定したのに設定や初回取得が不足する場合は起動を止める。公開配備のJWT鍵は必須。明示的なローカルモードだけはプロセス寿命のランダム鍵を利用できる。

認証不要の旧setup APIによる設定ファイル追記、credential登録、remote接続プローブ、SSM書き込みは廃止（410）。`GET /api/setup/status` は互換維持し、注入運用をsetup不足と誤判定しない。旧GUIは案内に変更。管理者向けの外部secret参照は残し、作成・更新・削除は410で拒否する。

## 起動設定の整理 (2026-10-03)

関連: actio:d5c70c98-abad-4620-b95f-ebf2fc11732e

- 残置されていた `env-cli.config.json` を撤去する。npmの開発コマンドはExによる環境注入を前提とし、設定生成やdotenv読み込みを追加しない。
- `env:up` / `env:up:standalone` はCompose用であり、設定生成ではないため保持する。単体運用とCompose独自の `.env` 補間、旧bootstrap変数の残存制約はREADMEに明記する。Compose自体は今回変更しない。
- Vault対応済みsecret-agent、既存のSSM互換経路、実データ、`.env` / `.env.secrets` は今回の変更対象外。

## 初回設定画面 (2026-09-21 追加)

neco の 2026-09-21 指示: 設定されていない場合は初回設定画面にする。形は「ローカル限定で入力可」。旧GUIの案内ページはこの画面に置き換えた。

- **判定**: 注入値と暗号化configを適用した後も、URL方言 (postgres / mysql) の `DATABASE_URL` が空なら未設定。判定は `src/setup/setup-state.ts` の1か所に置く。JWT等のsecret不足は対象外で、従来どおり起動失敗。
- **対象**: `ACTIO_LOCAL_MODE=1` のローカル配備だけ。公開配備の設定不足は起動失敗のまま (画面で補わない)。
- **動作**: `bootstrap` は本体 (DB・認証) を読み込まず、同じポート・loopbackだけで設定用の最小サーバー (`src/setup/`) を待ち受ける。`/api/health` は `needs_setup` で503、`/api/setup/status` は `needsSetup: true` と不足キー・保存可否を返し、それ以外は503。無言の劣化ではなく、Excubitorからは未設定として観測できる。
- **保存**: `POST /api/setup/local-config`。受け付けるのはソケットがloopbackでproxyヘッダの無い直接アクセスだけ (`allowsLocalRequest`、Cloudflare経由とLANは403)。キーは `DB_DIALECT` / `DATABASE_URL` / `DATABASE_PATH` / `REDIS_URL` に限り、secretは拒否する。接続URLはprotocolを検証し、値はログにも応答にも出さない。既存の暗号化configの他キーは保持する。
- **鍵**: `ACTIO_CONFIG_KEY` が未注入なら保存は409で、画面にその旨を出す。鍵を画面から受け取ることはしない。 鍵の置き場所はExcubitorのruntime-config (サービス別の暗号化config)。Excubitorはそれを `EXCUBITOR_SERVICE_CONFIG_JSON` 1変数にJSONでまとめて渡すので、Actioは起動時 (`src/config/excubitor/service-config.ts`) に展開する。明示注入された環境変数が優先。壊れたJSONは起動失敗 (2026-09-25追加)。
- **引き継ぎ**: 保存後は待受を閉じてポートを解放し、同じプロセスで本体を起動する (Excubitorでの再起動は不要)。空文字の注入が保存値を上書きして未設定が続く場合は、画面では直せないので起動失敗にする。
- 9/13に廃止した旧setup API (credential登録・remoteプローブ・SSM書き込み・設定ファイル追記) は410のまま。復活させたのは上記のローカル設定保存だけ。

## secret の取得元 (2026-10-03 Vault 対応)

関連: actio:84561cba-3297-419e-83e2-f995028e4dab

- 暗号化configで指定するのは `ACTIO_SECRET_KEYS` だけ。未設定・空なら取得しない。旧 project/environment 項目は既存ファイルを読めるよう allowlist に残すが、取得には使わず、新規setup入力では拒否する。
- Excubitor secret-agent の POST /api/v1/secrets/resolve に service=actio と keys を渡す。接続先とtokenは既存の注入・tokenファイル解決を使う。bindingと許可キーの管理はExcubitor側の責務であり、Actioは登録・更新しない。
- source=vault と secrets オブジェクトを必須とする。project_id/environment は照合しない。要求キーの部分集合（空集合も可）の文字列値だけを受理し、未要求キー、非文字列、配列、不正JSONは応答全体を拒否する。
- LOCAL_SETTING_KEYS は取得要求の時点で拒否する。値はプロセスメモリのみで、注入値 > 暗号化config > 取得secret の優先順位を維持する。手動更新時も完全な応答検証後にキャッシュを置き換える。
- 403 は key_not_allowed、404 は no_mapping、502 は fetch_failed。上流エラー本文やsecret値をエラー文へ転記しない。source=vault でなければ source_mismatch とする。
- 初回設定画面は「Vaultから受け取る」と直接入力を提供する。Vaultでは取得キーのみを保存し、その場で取得を試す。DATABASE_URLが解決できたときに本体起動へ進む。
- Infisical直接クライアントと旧マッピングAPIへの書き込みを撤去する。SECRETS_PROVIDER=infisical は無効な設定として停止する。env / SSM の既存設定方式は維持する。

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
