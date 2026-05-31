# Actio 機能リスト

LUDIARS の **タスク (Task) 管理基盤**。 2026-05-20 に予定 / カレンダー軸を
Schedula へ再分離し、 タスク管理に専念する構成になった。

## コア

| 機能 | 説明 | API |
|---|---|---|
| タスク (Task) | 解決すべき事象 (ToDo・Issue)。 deadline + requirements を持つ | `/api/tasks` |
| Task プラグイン基盤 | 機能を Task の plugin として拡張登録 | `src/task-plugins.ts` |

## PM (プロジェクト管理) モジュール

| 機能 | 説明 |
|---|---|
| プロジェクト作成 | GitHub Issues / Notion Database 接続 |
| 双方向タスク同期 | Pull (外部→Actio) / Push (Actio→外部) |
| 差分検知 & コンフリクト解決 | フィールドマージ / 外部優先 |
| タスク内容検証 | 充実度スコア・改善提案 |
| クリティカルパス分析 | タスク分解推奨込み |
| ゴンペルツ曲線 | バグ収束予測 |
| リマインダー | 納期警告・超過通知 |

API: `/api/pm`

## その他

| 機能 | 説明 | API |
|---|---|---|
| グループ管理 | グループ / メンバー | `/api/groups` |
| 通知 | Webhook 通知 | `/api/webhooks` |
| WebPush | PWA プッシュ通知 (Nuntius プロキシ) | `/api/push` |
| machina (Chat-to-Task) | DB テーブル / ページの残骸のみ。 機能は Discutere に移行済 | — |

## 共通基盤 (Schedula と複製保持)

- 認証 — Cernere SSO (PASETO V4 / id-cache)。 個人データは Cernere 単一情報源
- モジュール SDK — `@ludiars/schedula-sdk` (`defineModule()`)、 有効/無効を global/group/user スコープで制御
- マルチ DB — SQLite / PostgreSQL / MySQL (Drizzle ORM)
- WebSocket — 破壊的操作は `module_request` 経由、 読み取りは REST
- 外部 API 連携 — API Key 認証 (`/api/external`)
- 設定管理 / シークレット管理 (Infisical) / 操作ログ / DB ビューア / プロフィール

## 担わない (他サービスの領分)

- 予定 / カレンダー / マイプラン / 自動配置 / 休日 / 学校カリキュラム / 日程調整
  / GPS Placement → [Schedula](https://github.com/LUDIARS/Schedula)
- 施設予約 → [Aedilis](https://github.com/LUDIARS/Aedilis)

> 補足: Dashboard はカレンダー中心の構成が残存しており、 タスク向けの再設計が
> 別途必要 (split-task-only での prune はビルド整合を優先したため)。
