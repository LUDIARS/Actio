# PM 計画書の残り実装 (2026-10-02)

正本の計画は `modules/pm/PLAN.md`。本書は 2026-10-02 時点の実装との差分と、仕上げの設計を定める。

## 現状との差分

| 計画 | 現状 | 本対応 |
|---|---|---|
| §1.2 Cron による Pull | 手動同期 API のみ。`sync_interval_minutes` を読む処理が無い | 定期同期 tick を追加 |
| §1.2/§1.7 コンフリクト判定 | 外部の変更を「保存値との差」で判定するため、Actio 側の未送信編集が外部変更に見え、次の Pull で消える | 前回同期時点の外部値 (base) と比べて外部変更を判定する |
| §1.7 Stage 2 | 未実装 (外部優先で代替) | LLM による 3-way マージ。提供元が未設定なら人間の解決待ちに残す |
| §1.7 手動解決 | `resolve` が状態を resolved にするだけで、タスクへ反映しない | 解決内容をタスクへ適用し、書き戻し対象にする |
| §1.4 通知 | `pm.*` イベント名はあるが一度も送らない | タスク通知の送信箱 (`task_notifications`) に積み、既存の配送で Memoria へ送る |
| §2 リマインダー | 設定を保存しない。定期チェックが無い | 設定を `pm_projects.reminder_settings` に保存し、定期 tick で警告・超過・日次レポートを送る |
| §3.2 ステータス変更時検証 | 関連コミット・テストファイルが常に空 | GitHub のコミット検索と変更ファイルから、関連コミットと対応テストを集める |
| §4.1 進捗予測 | `projectedCompletionDate` が常に null | 担当者ごとの完了速度から予測する |
| §4.3 ゴンペルツ | 修正数をタスク作成日で数える。総合レポートで null | 完了日は close スナップショットの日付を使う。総合レポートに含める |
| 分析キャッシュ | テーブルのみ | 総合レポートをキャッシュし、同期で無効化する |
| 接続トークン | `source_config` に平文で保存し、一覧 API がそのまま返す | 保存時に暗号化し、API 応答では伏せる |
| REST / WS | 同期処理が 2 か所に複製 | 同期を 1 つのユースケースにまとめ、REST・WS・tick から呼ぶ |

## 価値と不変条件

- AT-PM-SYNC: 外部 (GitHub/Notion) が正。外部の変更は取り込み、Actio 側の未送信編集は外部に変更が無い限り失わない。
  - 不変条件 1: 外部が前回同期から変わっていないタスクは、Pull で Actio 側の値を上書きしない。
  - 不変条件 2: 同じプロジェクトの同期は同時に 1 本だけ走る (手動・定期の重複を拒否する)。
  - 不変条件 3: 書き戻しに失敗したタスクは dirty のまま残し、次回再試行する。
- AT-PM-CONFLICT: 両側の変更が重なったときだけ解決が要る。
  - Stage 3 (外部の変更率 > 70% または open↔closed) は外部を採用し、Actio 側の値はコンフリクト記録に残す。
  - Stage 1 (変更フィールドが重ならない) はフィールド単位でマージし、マージ結果を書き戻す。
  - Stage 2 (重なる) は pending のコンフリクトとして残し、LLM マージを試みる。提供元が無い・失敗した場合は人間の解決待ちのまま (成功扱いにしない)。
  - 解決結果はタスクへ適用し、書き戻し対象 (dirty) にする。解決済みの再解決は拒否する。
- AT-PM-NOTIFY: 通知は付随処理。積めなくても同期・タスク更新は成立させる。同じ変化は dedupe キーで 1 回だけ送る。
- AT-PM-REMINDER: 納期の警告・超過は、タスクと納期の組ごとに 1 日 1 回まで。日次レポートはプロジェクトごとに 1 日 1 回。
- AT-PM-VALIDATION: ステータスが review に変わったとき、関連コミットと対応テストを記録する。GitHub 以外・取得失敗は `unknown` とし、`missing` と区別する。
- AT-PM-ANALYTICS: 予測は観測された完了速度だけから出す。速度が 0 なら予測日は null。
- AT-PM-SECRET: 接続トークンは暗号文で保存し、API・WS の応答に平文を出さない。`ACTIO_CONFIG_KEY` が無い環境ではトークンの新規保存を拒否する。既存の平文は読めるが、次の更新で暗号化する。

## 設計

### 境界

- `modules/pm/domain/` — 純関数 (コンフリクト判定・通知の意図・リマインダー判定・進捗予測・テスト照合)。DB・fetch・環境変数に依存しない。
- `modules/pm/application/` — ユースケース (同期・コンフリクト解決・リマインダー巡回・ステータス変更検証)。リポジトリと外部 API は引数の deps で受ける。
- `modules/pm/sync/*`, `modules/pm/llm/*`, `modules/pm/secret/*` — 外部 I/O の adapter。
- `modules/pm/runtime/tick.ts` — 起動経路 (`src/index.ts`) から 1 回だけ呼ぶ定期実行。テストでは呼ばない。

### 同期 (AT-PM-SYNC)

- base = 前回同期時点の外部値。タスクの最新スナップショット (`pm_task_snapshots.snapshot_data`、外部値を保存している) を使う。無ければ保存値。
- 外部変更あり = 外部値と base の差がある。
- ローカル変更あり = `dirty_flag = 1`。
- 外部変更なし → ローカルを保持 (dirty なら書き戻しへ)。外部変更あり・ローカル変更なし → 外部で上書き。両方 → コンフリクト判定。
- プロジェクトごとの実行中フラグ (プロセス内) で重複を拒否する。手動同期中の重複は 409。
- 結果は `pm_projects.last_sync_result` に保存し、`sync/status` が返す。

### 定期実行

1 分 tick。各プロジェクトについて `last_synced_at + sync_interval_minutes` を過ぎていれば同期する。続けてリマインダーを巡回し、LLM マージ待ちのコンフリクトを 1 件ずつ試す。tick の例外は隔離して記録する。

### 通知 (AT-PM-NOTIFY)

`pm.*` の意図を作り、既存の `enqueueNotifications` で送信箱に積む。PM プロジェクトはチームを持たないので配送先は Memoria (個人)。本文に個人名を入れず、担当者は外部ログイン名のまま扱う。

| イベント | 契機 | dedupe キー |
|---|---|---|
| pm.task.created / updated / closed / reopened / assigned | Pull で検出した変化 | イベント + タスク + 外部 updatedAt |
| pm.sync.conflict / auto_merged / claude_merged / force_external | コンフリクト処理 | イベント + タスク + 外部 updatedAt |
| pm.writeback.success / failed | 書き戻し | イベント + タスク + 時刻 (分) |
| pm.deadline.warning / overdue | リマインダー巡回 | イベント + タスク + 納期 + 当日 |
| pm.report.ready | 日次レポート時刻を過ぎた最初の巡回 | イベント + プロジェクト + 当日 |

### Stage 2 LLM マージ

既存の内容審査と同じ OpenAI 互換の提供元設定 (`ACTIO_INTAKE_LLM_URL` / `_MODEL` / `_KEY`) を使う。出力は zod で検証し、重なったフィールド以外の値は変えさせない。`POST /api/pm/conflicts/:id/auto-merge` で手動起動もできる。

### リマインダー設定

`pm_projects.reminder_settings` (JSON, null = 既定値)。PUT は値を検証して保存する (`deadlineWarningDays` 0〜30、`dailyCheckTime` HH:MM)。

### ステータス変更時検証

GitHub プロジェクトで status が review に変わったとき (Actio 側編集・Pull の両方)、`GET /search/commits?q=repo:{owner}/{repo} #{issue}` で関連コミットを探す。各コミットの変更ファイルを取り、`*.test.*` / `*.spec.*` はそのまま、それ以外は同じ basename のテストがリポジトリ内にあるかを tree から照合する。結果は `pm_task_validations` に保存する。API: `GET /tasks/:id/related-commits`, `GET /tasks/:id/test-coverage`。

### 接続トークン

`modules/pm/secret/token-box.ts` で `token` を AES-256-GCM 暗号化する (鍵は `ACTIO_CONFIG_KEY` から scrypt で導出)。保存形式は `enc:v1:` で始まる。応答は `token` を除き `hasToken` を付ける。PUT でトークンを省略したら既存を保持する。

### 画面

- プロジェクト詳細: 同期状態 (実行中・前回結果)、リマインダー設定、コンフリクトの解決 (外部採用・ローカル採用・LLM マージ)、検証結果に関連コミット・テストを表示する。
- 分析: 予測完了日とゴンペルツを表示する (既存ページの値を埋める)。

## 範囲外

- `defineModule()` への移行と認可 (プロジェクトの所有者制限) の追加。現状どおり認証済みユーザーなら操作できる。
- MySQL 方言 (PM テーブルが元々無い)。
