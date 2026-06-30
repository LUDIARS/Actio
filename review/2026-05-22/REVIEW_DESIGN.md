# Actio コードレビュー — REVIEW_DESIGN.md (2026-05-22)

## 対象情報

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ | feat/split-task-only |
| レビュー実施日 | 2026-05-22 |
| 対象コミット範囲 | latest (0436ecd) |

---

## 1. 設計強度 (Design Robustness)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | 障害分離 | Redis キャッシュ層とメイン DB の分離、モジュール化された外部 API 連携で縮退動作可能 |
| B | 冪等性 | 破壊的操作 (POST/PUT) を WS `module_request` で一元化。再実行時の排除が未検証 |
| A | 入力バリデーション | Hono 標準の型チェック + Cernere ユーザー検証。フロントエンド側の form validation も充実 |
| A | エラーハンドリング | 全 HTTP エラー系を `app.onError()` で統一。JSON + structure log で運用対応可能 |
| B | リトライ・タイムアウト設計 | PostgreSQL 接続リトライあり (10s connect_timeout)。任意の async operation のタイムアウトが薄い |
| A | 状態管理の明確性 | Module state (enabled/disabled) を DB 集約。group/user/global スコープで一貫管理 |

### 主要指摘

- **B: リトライ戦略不十分** (`src/db/dialects/postgres.ts:25-45`) — 接続失敗時は最大 3 回リトライするが、middleware 層での任意の async operation (外部 API 呼び出し等) にはリトライ機構がない。高可用性要件がある場合は `node-retry` 等の導入を検討

---

## 2. 設計思想の一貫性 (Design Philosophy Compliance)

| 該当箇所 | 逸脱内容 | 本来の設計思想 | 推奨修正 |
|----------|---------|--------------|---------|
| — | なし | リポジトリパターン、モジュール SDK、個人データ Cernere 委譲 | N/A |

**評価:** A。個人データ禁止ルール、リポジトリ層経由のデータアクセス、モジュール SDK による拡張登録が一貫して適用されている。CLAUDE.md に明記された規約が遵守されている。

---

## 3. モジュール分割度 / 機能的凝集度 (Cohesion & Modularity)

| モジュール / 層 | 凝集度評価 | 所見 |
|-------------------|-----------|------|
| `src/auth/` | 機能的 | 認証関連に特化。Cernere 統合・session キャッシュ・JWT 検証が一箇所 |
| `src/db/` | 機能的 | リポジトリ + スキーマ + 方言を分離。Drizzle 抽象化が徹底 |
| `src/plugins/` | 機能的 | モジュール loader / registry / admin routes が各ファイルで独立 |
| `modules/task/` | 機能的 | タスク CRUD + プラグイン登録に集中 |
| `modules/pm/` | 機能的 | GitHub/Notion 同期・差分検知・分析が一堂。将来はタスク plugin 化推奨 |
| `frontend/src/pages/` | 通信的 | 各ページが独自の API 呼び出しを持つ。shared `api.ts` で集約だが一部重複あり |

**評価:** A。責務の分離が明確。予定系コード削除後も各モジュール間の結合度は低い。

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 設計強度 | B | 1 |
| 2 | 設計思想の一貫性 | A | 0 |
| 3 | モジュール分割度 | A | 0 |
