# Actio バックエンドの C++ 移行

要件 ID `AT-PORTUS-BACKEND`。対象タスク `actio:7df004b5-cdcb-43a6-8682-7c4074e63a77`。

## 移行単位

現行の公開契約は `src/app.ts` のマウント表、各モジュールのルート、`src/ws/` のコマンドで定める。Cc の呼び出しと `frontend/` は同じ URL を使い続ける。各段階は独立した local PR とし、実運用の切り替えは最後にまとめる。

| 順序 | 変更 | 対応する回帰確認 |
|---|---|---|
| 1 | CMake 4.2 以上、VS 2026 x64、C++23 の実行ファイルと liveness を追加 | DB が使えない時も 200。service、version、UTC timestamp、status を検査 |
| 2 | 認証境界、PostgreSQL 接続、auth/me、projects/cc、teams | loopback と公開経路、Cloudflare Access、既存セッション、チーム所属の成否ごとにステータスと JSON を照合 |
| 3 | GET /api/tasks と詳細取得。権限フィルタを SQL に適用してからページを切る | 両 sort で同時刻・期限なし・最終ページ・壊れたカーソル、他チームの不可視タスクを確認 |
| 4 | 作成・更新、スプリント、計画、監査・通知 | 同一入力を隔離した同一初期状態の DB で実行し、応答、更新行、監査、イベントを照合 |
| 5 | 残りの API、予定・カレンダー、プラグイン、管理・設定、WebSocket | マウント表と利用側の method/path を突合。認可エラー、予定操作、購読、再接続、配信対象を含める |
| 6 | Excubitor の backend command と runtime を更新し、親セッションが反映 | Cc の登録・更新・全ページ取得とフロントのログイン・購読を実経路で確認 |

## 実装境界

Portus の `HttpServer`、`RouteDef`、`Reply` を使う。大きな応答も所有権のある本文として返し、送信完了と書き込みタイムアウトの管理を Portus に任せる。外部入力は Lorica の byte_view で境界を表現し、checked_size と input_budget で長さと累積量を検査してから変換する。Actio のターゲットは find_package(Lorica CONFIG REQUIRED) と lorica_harden_target を使用する。契約述語は C++23 で記述する。

DB アクセスには libpq のパラメーター付きクエリを使う。接続と結果は RAII で解放し、トランザクションの開始から終了まで同じ接続を占有する。接続数上限 10、接続タイムアウト 10 秒、statement_timeout 7 秒は現行の postgresOptions に合わせる。資格情報は現行の Excubitor 注入経路から読み、欠落時は readiness を失敗させる。接続文字列を診断に含めない。スキーマとデータを共用し、切り戻し期間は旧版が読める形式で書く。

接続層の先行 PR は `actio:1b8e85b2-0b76-45d5-bf67-2597f0d0e73e` に対応する。DB を必要とするワーカーは `makeInjectedPostgresPool()` に、既存の起動処理で解決済みの `DATABASE_URL` をプロセス環境から渡す。接続はワーカーが `acquire` した時に作り、取得待ちと接続処理で同じ単調時計の期限を使う。TCP keepalive を 15 秒に設定し、待機中の接続は 30 秒を超えると次回取得時に廃棄する。libpq 内の名前解決が期限を超えても呼び出し側には期限時点で失敗を返し、名前解決が終わるまで接続枠を保持する。

結果は一行ずつ Portus の `DbResult` に渡し、SQL NULL と空文字を区別する。サーバーが応答を完了した SQL エラーは同じ接続でロールバックできる。通信断、クライアント側の期限切れ、応答の上限超過は接続を破棄する。コミットの応答を受け取れなかった場合は対象 ID で結果を確認する。HTTP の readiness と各 API への配線は後続 PR で行う。

段階 2 の直接接続候補は `actio:1b8e85b2-0b76-45d5-bf67-2597f0d0e73e` に対応する。候補の待受は IPv4 ループバックに限定し、`ACTIO_LOCAL_MODE=1` の時だけ直接接続を持ち主として扱う。接続元ソケット、Host、Origin、Fetch Metadata と転送を示すヘッダーを検査してから、共有 PostgreSQL に `actio-local` の FK アンカーを競合安全に作る。DB 接続は許可された最初の要求まで遅延し、同じ単調時計の期限を取得・問い合わせに渡す。候補は `GET /api/auth/me` で `localMode: true` と `access: "loopback"` を返し、`GET /api/teams` では全チームの `leader`、`GET /api/projects/cc` では有効なプロジェクトの一覧を返す。

Cloudflare Access と Cernere のトークン処理は、Portus の共通認証部品を追加した後に配線する。公開経路と既存ログインには移行前の backend を使用する。候補の回帰確認 `actio_concordia_http_boundary` は接続を開始せず、持ち主判定、DB 取得前の拒否、DB 障害後の再試行、チームとプロジェクトの応答を検査する。

タスク一覧の契約は [一覧 API](task-list-api.md) に従う。旧版の nextCursor を新版が引き継げることと、その逆を確認する。limit=500 の約 640 KB の固定データで、通常の読み手と小分けに読む読み手の両方について、受信完了、本文のバイト数、末尾のタスク、次ページを検査する。HTTP 200 の記録だけでは完了の証跡にならない。

段階 3 の直接接続候補は `actio:1b8e85b2-0b76-45d5-bf67-2597f0d0e73e` に対応する。認証済みのローカル持ち主には `GET /api/tasks` と `GET /api/tasks/:id` を提供する。一覧は PostgreSQL の絞り込みと順序で最大 limit + 1 行を取得し、Portus のキーセット部品でページ化する。nextCursor は Node 版と共通の v1 JSON の base64url 表現とし、同じ並び順で引き継ぐ。チーム指定時は `team_refs` の存在を確認し、該当チームのタスクだけを取得する。

`view=current_sprint` は進行中スプリントの項目と未割付の未完了バックログを全文付きで返す。PostgreSQL 接続層の応答上限は一クエリ 1,024 行・16 MiB で、上限超過はエラーとして扱う。候補の `actio_task_read_boundary` は DB に接続せず、3 種類の旧版カーソル、一覧と詳細の投影、認証、スプリント表示、期限切れ応答を検査する。

段階 4 の直接接続候補は `actio:1b8e85b2-0b76-45d5-bf67-2597f0d0e73e` に対応する。`POST /api/tasks` は `{task}` を 201 で返し、閲覧可能な同一 `source/source_ref` の再送は同じタスクを 200 で返す。`PATCH /api/tasks/:id` は持ち主が所有または担当するタスクを行ロック下で更新し、明示 null と省略を区別する。依存関係の更新はチームのクリティカルパスを再計算し、割当・完了・優先度・作業者の変更は既存の通知送信箱に積む。計算と通知は確定済みの更新に付随する処理とする。期限は ISO 日付または日時を受け付け、候補の PostgreSQL 17 で検証して UTC 表記へそろえる。

`POST /api/teams/:teamId/planning/sprints` と `PATCH /api/teams/:teamId/planning/sprints/:id` は `team_refs` にあるチームに対して `{sprint}` を返す。既存のチーム単位の計画ロックを使い、期間の重複、版の競合、計画外からの直接開始・終了、別チームのタスク割当を拒否する。計画変更、割当と監査行は同一トランザクションで確定する。`actio_task_write_boundary` は DB を差し替え、再送、権限、更新応答、通知、版競合と監査のロールバックを確認する。

段階 4 の受け入れ確認では、この回帰テストと既存の死活、PostgreSQL ポリシー、認証、ページ読みテストを審査環境で実行し、C-28〜C-36 の観測を集計する。隔離 PostgreSQL 上での Node 版との応答・更新行・通知の比較は切り替え前に行う。

Portus の HTTP と WebSocket には独立した listen がある。現行の actio-web は同一 backend に Upgrade を送るため、切り替えまでに同一ポートで /ws を引き渡せる実装が必要になる。Portus 側で共有 listener を追加する場合は、独立した Portus PR で認証コンテキストと接続の所有権移譲を検証する。

## 段階 5 のルート突合

対象は `actio:1b8e85b2-0b76-45d5-bf67-2597f0d0e73e`。Node の `src/app.ts`、マウント先と `src/ws/commands/` を C++ の `cpp/src/main.cpp`、`cpp/src/http/concordia_routes.cpp` と照合した。利用側は Concordia の `src/taskflow/actio-*.ts`、`src/developer-tools/critical-path.ts`、`src/bounty/actio-adapter.ts`、Actio の `frontend/src/lib/api.ts` と計画画面などの個別 API クライアント。actio-web の `src/web-server/{server,proxy}.ts` は `/api`、`/ws`、`/.well-known` を同一の backend に渡す。

Cc のタスク一覧・詳細・作成・更新、`GET /api/teams`、`GET /api/projects/cc` は段階 2〜4 で直接接続候補に実装済み。計画画面が使う `GET /api/tasks?view=current_sprint`、`POST /api/teams/:teamId/planning/sprints`、`PATCH /api/teams/:teamId/planning/sprints/:id` も実装済み。公開・認証付きの経路は別途互換確認が必要。

表のパスは各欄の接頭辞からの相対パス。括弧内は同じ接頭辞のパス末尾を列挙する。

| 領域・接頭辞 | Node の method / path | 呼び出し元と移行状況 |
|---|---|---|
| チームの依存分析 `/api/teams` | GET `/:teamId/critical-path` | Cc のタスク依存参照と開発ツール。今回、直接接続候補に追加 |
| タスク基本操作 `/api/tasks` | GET `/plugins`、`/categories`、`/notifications`。POST `/categories`。DELETE `/categories/:name`、`/:id`。PATCH `/:id/lane` | フロントのタスク画面・カテゴリ管理・計画操作、通知管理。削除、カテゴリ、レーン変更は直接接続候補に移行済み。プラグイン・通知管理は未移行 |
| チーム情報 `/api/teams` | GET `/memberships/:userId`、`/:teamId/{members,settings,projects}`。PUT・DELETE `/:teamId/members/:userId`。PATCH `/:teamId/settings` | フロントのチーム管理・計画。直接接続候補に移行済み |
| Cc プロジェクト `/api/projects` | GET `/cc/:code/sprints` | Cc プロジェクトに紐づくスプリントの参照。未移行 |
| 計画 `/api/teams/:teamId/planning` | GET 接頭辞直下、`/sprints/:id/history`。POST `/groups`。DELETE `/groups/:id`。PUT `/order` | フロントのスプリント計画・バックログ。未移行 |
| 仕様照会 `/api/teams/:teamId/planning/praeforma/projects` | GET 接頭辞直下、`/:pid/specs`、`/:pid/specs/:sid`、`/:pid/implementation`、`/:pid/implementation/service`。POST `/:pid/specs/:sid/backlog`、`/:pid/implementation/:kind/:id` | フロントの計画・仕様取り込みとサービス連携。未移行 |
| スプリント判定 `/api/teams/:teamId/planning` | GET `/sprints/:id/phase`、`/autonomous-sprint`、`/autonomous-sprint/dots`。PUT `/sprints/:id/phase/context`。POST `/sprints/:id/phase/decisions`、`/autonomous-sprint`、`/autonomous-sprint/:sprintId/{pause,reconcile,release}`、`/autonomous-sprint/dots/{control,claims}` | フロントの計画と Dots の実行制御。未移行 |
| Terpsichore `/api/teams/:teamId/planning/terpsichore` | GET・PUT `/plan`。POST `/assess`、`/advice`。GET・POST `/execution`。GET `/execution/{templates,preview,:id/manifest}` | フロントの計画と Cc への実行委託。未移行 |
| チャット `/api/teams`・`/api/chat/commands` | POST `/api/teams/chat/{local-team,local-project}`。 `/api/teams/:teamId/chat` 配下で GET `/{state,logs/:channel}`、PUT `/{connection,destination,discussion/:channel}`、POST `/{commands,intakes/:id/confirm,outbox/:id/retry}`。POST `/api/chat/commands/{access,discord/:team/interactions}` | フロントのチャット計画と外部コマンド。未移行 |
| PM `/api/pm` | GET・POST `/projects`。GET・PUT・DELETE `/projects/:id`。POST `/projects/:id/sync`、`/projects/:id/reminders/test`。GET `/projects/:id/{sync/status,tasks,conflicts,analytics/progress,analytics/critical-path,analytics/decomposition,analytics/gompertz,analytics/report}`。GET・PUT `/projects/:id/reminders`、`/tasks/:taskId`。GET `/tasks/:taskId/{history,validation,related-commits,test-coverage}`。POST `/tasks/:taskId/validate`、`/conflicts/:conflictId/{resolve,auto-merge}` | Cc 開発ツールが使うプロジェクト一覧とクリティカルパス、および PM 画面のプロジェクト詳細を直接接続候補に追加。ほかは未移行 |
| 課題の共通基盤 | GET `/api/{links,comments}/:type/:id`。POST `/api/{links,comments}`。DELETE `/api/{links,comments}/:id`。PATCH `/api/comments/:id`。GET `/api/custom-fields/{definitions,:type/:id}`。PUT・DELETE `/api/custom-fields/:moduleId/:fieldId/:type/:id`。GET `/api/public/issues` | プラグイン基盤・公開課題フロント。未移行 |
| 認証とプロフィール | GET `/api/auth/{login-url,ws-token,users,users/list}`。POST `/api/auth/{exchange,logout}`。PUT `/api/auth/users/:id/role`。GET・PUT `/api/profile/me`。GET `/api/profile/{users/:id,me/roles,groups/:groupId/roles}`。PUT `/api/profile/me/roles/:groupId` | フロントの公開・ユーザー経路。トークンと個人情報は Cernere で扱う。未移行 |
| 管理・設定 | GET・PUT `/api/settings`、GET `/api/settings/export`。GET・PUT `/api/user-prefs`、GET・DELETE `/api/user-prefs/:key`。GET `/api/secrets/{status,keys,value/:key}`、POST `/api/secrets/refresh`、PUT・DELETE `/api/secrets/:key`。GET `/api/admin/{activity-logs,db/tables,db/tables/:tableName,modules,modules/manifests}`、POST `/api/admin/modules/:id/{enable,disable,uninstall}` | フロントの管理と SDK 管理。未移行 |
| グループ `/api/groups` | GET `/my`、`/:id`、`/users/search`。POST 接頭辞直下、`/:id/{join,leave,invite}`。PUT `/:id/members/:memberId/role`。GET・PUT `/:id/modules` | フロントのグループ画面。タスクで使う共通基盤として未移行 |
| 通知 `/api/m5`・`/api/webhooks` | GET・POST `/webhooks`、PUT・DELETE `/webhooks/:id`、POST `/webhooks/:id/{test,rotate-secret}`、GET `/webhooks/:id/logs`。GET・PUT `/notifications/preferences`、GET `/notifications/history`、POST `/notifications/:id/read`、DELETE `/notifications/:id`。GET・POST `/templates`、GET・PUT・DELETE `/templates/:id`、POST `/templates/preview` と `/test-send` | フロントの通知管理が `/api/m5` を使用。既存通知送信箱への書き込みは段階 4。HTTP の管理経路は未移行 |
| 外部タスク API `/api/external` | GET `/docs`、GET・POST `/clients`、POST `/clients/:id/regenerate`、PUT・DELETE `/clients/:id`。GET・POST `/tasks`、GET・PUT `/tasks/:id` | フロントのクライアント管理、外部 API キー経路。未移行 |
| 共通入口 | GET `/`、`/api/ready`、`/api/health`、`/api/setup/status`、`/.well-known/corpus-service.json`、`/api/example/hello`、`/api/example/hello/me`。POST `/api/setup/local-config`、`/api/admin/modules/install-package` | actio-web のプロキシ対象に corpus を含む。設定保存は初回設定専用の入口。ヘルスチェックは `/api/health/live` のみ移行済み |
| WebSocket | GET `/ws` Upgrade、GET `/api/auth/ws-token`。受信 `pong` と `module_request`。PM の `create_project,update_project,delete_project,sync,update_task,resolve_conflict,validate_task`、group の `create,join,leave,invite,update_member_role,update_modules`、admin の `update_settings,update_user_role` | フロントの接続、PM・グループ画面の購読。未移行。Portus の共有 listener を先行 PR とし、再接続時の再認証・購読の復元とユーザー／グループ単位の配信を確認する |

### 予定・カレンダーの切り替え判断

2026-11-26 の方針に従い、稼働中の予定・カレンダー機能を Actio に残す。C++ 版で互換性を確認した後に段階 6 へ進む。

| 経路 | 観測結果 | 移行方針 |
|---|---|---|
| `/api/events`、`/api/calendar`、`/api/myplans`、`/api/smart-scheduler`、`/api/holidays`、`/api/voting`、`/api/m1`、`/api/m3`、`/api/integrations`、placement・school | Node のマウント表では予定・学校 SDK を解除済み。フロントに旧クライアントが残る | 解除済みの旧経路は削除予定。画面が使う予定機能は稼働中の C++ 移行対象と照合する |
| GET `/api/timetable` | Node の共通時間割 | C++ 候補へ移行済み |
| POST `/api/groups/:id/schedules`、GET・POST `/api/groups/:id/events`、PUT・DELETE `/api/groups/:id/events/:eventId`。 `/api/external` 配下で GET・POST `/calendar/events`、GET・PUT・DELETE `/calendar/events/:id`、GET・POST `/schedules/{plans,myplans}`、DELETE `/schedules/{plans,myplans}/:id`、GET `/reminders/reminders`。group WS の `create_schedule,create_event,update_event,delete_event` | Node に稼働経路が残る。フロントのグループ画面と外部 API が利用し得る | C++ へ移す。認証とグループ権限、外部 API の認可、予定操作後の配信を切り替え前に確認する |
| `/api/school/facility-booking`、`/api/reservations`、`/api/cocoiru` | フロントに旧経路が残り、Node のマウント表では解除済み | 旧経路は削除予定。施設予約は Aedilis が担当する |

チームのクリティカルパスは認可済みの直接接続について `taskIds`、`totalDays`、`cycles`、`tasks` を返す。既存の書き込み後の再計算と同じグラフ処理を使い、読み取りでは保存済みの派生値を更新しない。取得行数は既存の PostgreSQL 接続層の制限に従う。回帰テストは依存鎖、余裕日数、所要日数の出典、循環と自己参照、空のチーム、未登録チーム、転送経路の拒否を検査する。

`DELETE /api/tasks/:id` は直接接続の持ち主が所有するタスクを行ロック下で削除し、スプリントに割り当て済みなら 409 を返す。確定後は既存のチーム再計算を使う。PM の直接接続では接続トークンを SQL の投影で除外し、`hasToken` を含む既存の応答を返す。PM のクリティカルパスはチーム計画と所要日数・リスク・応答形式が異なるため、PM の計算を移植する。時間割は DB 接続を使わず、曜日と時限を既存の形で返す。回帰テストは `actio_stage5_http_boundary`、観測契約は C-38〜C-41。

段階 5 の続き (`actio:1b8e85b2-0b76-45d5-bf67-2597f0d0e73e`) では、フロントのカテゴリ管理とレーン変更を移す。カテゴリ API は持ち主の未完了タスクのラベルと既存の `task.categories.registered` をまとめ、重複を除いた `{items}` を返す。新規登録の `name` は文字列とし、並び順には PostgreSQL の照合順序を使う。登録解除後も未完了タスクに付いたラベルは一覧に残る。レーン API はタスクの所有者または担当者でチームに所属する持ち主に限り、行ロック下でレーン、期限、所要日数を更新する。backlog から daily への変更では期限を解除し、スプリント割当中は 400 を返す。回帰テストは `actio_task_organization_boundary`、観測契約は C-42〜C-43。

段階 5 の続き (`actio:1b8e85b2-0b76-45d5-bf67-2597f0d0e73e`) で、チーム管理の経路を移す。直接接続の持ち主は、Node の管理者経路と同じくチームに所属しなくても所属一覧の取得とメンバーの登録・削除ができる。チームの権限を要する経路 (`members`、`settings`、`projects`) では、`team_refs` に無いチームに 403 を返す。メンバー登録は `leader` か `member` だけを受け付け、チームの存在確認と upsert を一つの文で行う。設定の変更は行ロック下で保存済みの値に重ね、未知のキーと範囲外の値を 400 で拒否する。保存済みの未知キーは除き、既定値で補った 16 項目を Node のスキーマと同じ順で返す。`issues` は項目ごとの `code`・`path`・`message` を返すが、zod と同じ文言ではない。`cc_settings` は変更しない。回帰テストは `actio_team_admin_boundary`、観測契約は C-44〜C-45。

## Windows でのビルド確認

Revisor の登録コマンド `npm test` は Vitest 成功後に CMake で候補版をビルドし、CTest の `actio_health_response` で死活応答を検査する。審査ホストには CMake 4.2 以上、VS 2026、OpenSSL 3 と Portus・Lorica のソースを用意する。配置の上書きには `PORTUS_SOURCE_DIR` と `LORICA_SOURCE_DIR`、導入済み Lorica には `Lorica_DIR` を使う。

DB 接続層のビルドには Portus `142d69e` 以降、PostgreSQL の開発用ヘッダーと libpq が必要になる。Windows で CMake が既定のインストール先を検出できない場合は `PostgreSQL_ROOT` を指定する。CTest の `actio_postgres_boundary` は外部 DB に接続せず、取得期限、接続ポリシー、設定欠落、SQL NULL と空文字の取り扱いを確認する。

2026-11-25、Portus 9a73450 の cpp を CMake 4.4.4、Visual Studio 18 2026、MSVC 19.52、OpenSSL 3.2.1 で構成した。Release x64 の portus.lib の生成と portus_hello.exe のリンクを確認した。サンプルを実行する検証は反映担当に引き継ぐ。

## 切り替えと切り戻し

移行中は 17880 で現行 backend を維持する。親セッションは候補版を別の loopback ポートと隔離 DB で検証する。本番への書き込みを二重送信しない。互換確認が済んだルートは旧実装を凍結し、旧版の配布物と catalog を切り戻し用に保管する。

親セッションは Cc の新規書き込みを一時停止し、実行中の書き込みの確定を確認してから Excubitor で旧 backend を止め、同じ 17880 で候補版を起動する。liveness、readiness、一覧最終ページ、更新、WebSocket を確認して受け付けを再開する。読取の欠落、認可差異、更新の不整合があれば旧 catalog と配布物に戻す。結果不明の更新は対象 ID の照会で確定してから再開する。切り戻し期間の終了後に src/modules の旧ルートと Hono 依存を削除する。
