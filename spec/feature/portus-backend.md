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
| 5 | 残りの API、プラグイン、管理・設定、WebSocket | マウント表と利用側の method/path を突合。認可エラー、購読、再接続、配信対象を含める |
| 6 | Excubitor の backend command と runtime を更新し、親セッションが反映 | Cc の登録・更新・全ページ取得とフロントのログイン・購読を実経路で確認 |

## 実装境界

Portus の `HttpServer`、`RouteDef`、`Reply` を使う。大きな応答も所有権のある本文として返し、送信完了と書き込みタイムアウトの管理を Portus に任せる。外部入力は Lorica の byte_view で境界を表現し、checked_size と input_budget で長さと累積量を検査してから変換する。Actio のターゲットは find_package(Lorica CONFIG REQUIRED) と lorica_harden_target を使用する。契約述語は C++23 で記述する。

DB アクセスには libpq のパラメーター付きクエリを使う。接続と結果は RAII で解放し、トランザクションの開始から終了まで同じ接続を占有する。接続数上限 10、接続タイムアウト 10 秒、statement_timeout 7 秒は現行の postgresOptions に合わせる。資格情報は現行の Excubitor 注入経路から読み、欠落時は readiness を失敗させる。接続文字列を診断に含めない。スキーマとデータを共用し、切り戻し期間は旧版が読める形式で書く。

タスク一覧の契約は [一覧 API](task-list-api.md) に従う。旧版の nextCursor を新版が引き継げることと、その逆を確認する。limit=500 の約 640 KB の固定データで、通常の読み手と小分けに読む読み手の両方について、受信完了、本文のバイト数、末尾のタスク、次ページを検査する。HTTP 200 の記録だけでは完了の証跡にならない。

Portus の HTTP と WebSocket には独立した listen がある。現行の actio-web は同一 backend に Upgrade を送るため、切り替えまでに同一ポートで /ws を引き渡せる実装が必要になる。Portus 側で共有 listener を追加する場合は、独立した Portus PR で認証コンテキストと接続の所有権移譲を検証する。

## Windows でのビルド確認

2026-11-25、Portus 9a73450 の cpp を CMake 4.4.4、Visual Studio 18 2026、MSVC 19.52、OpenSSL 3.2.1 で構成した。Release x64 の portus.lib の生成と portus_hello.exe のリンクを確認した。サンプルを実行する検証は反映担当に引き継ぐ。

## 切り替えと切り戻し

移行中は 17880 で現行 backend を維持する。親セッションは候補版を別の loopback ポートと隔離 DB で検証する。本番への書き込みを二重送信しない。互換確認が済んだルートは旧実装を凍結し、旧版の配布物と catalog を切り戻し用に保管する。

親セッションは Cc の新規書き込みを一時停止し、実行中の書き込みの確定を確認してから Excubitor で旧 backend を止め、同じ 17880 で候補版を起動する。liveness、readiness、一覧最終ページ、更新、WebSocket を確認して受け付けを再開する。読取の欠落、認可差異、更新の不整合があれば旧 catalog と配布物に戻す。結果不明の更新は対象 ID の照会で確定してから再開する。切り戻し期間の終了後に src/modules の旧ルートと Hono 依存を削除する。
