# Web 実装評価 (Web Implementation Evaluation) — Actio

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | feat/split-task-only |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 15261cd .. 8b2dfcb |

---

## 1. コード品質 (Code Quality)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 型安全性 | TypeScript strict mode。`any` 型はほぼ排除済みだが、src/middleware/rate-limit.ts:55 で eslint-disable-next-line による `any` 残存が 1 件。 |
| A | 命名・可読性 | routes / repository / middleware の関数名は動詞-noun で明確。VALID_STATUSES 等の定数化が徹底。 |
| A | デッドコード | split-task-only での予定系削除でデッドコードが大幅減。残るは users table の legacy column (DROP 禁止ルールで残置、コメントで明示)。 |
| B | 重複コード | repository 層で DB アクセスを一元化し DRY 遵守。routes 間で validation ロジックの軽微な重複あり。 |
| A | 例外処理 | 空の catch なし。app.onError() で uncaught を集約、本番では詳細非露出。 |

### チェック項目

- [x] マジックナンバー — 定数化されている
- [x] 過度なネスト — 早期リターン多用で max depth 2-3
- [x] デッドコード — 予定系削除後はクリーン。legacy column のみ意図的残置
- [x] DRY 違反 — repository 一元化。軽微な validation 重複
- [x] スコープ — env 設定は export const で lock。repo 関数は local scope
- [x] 例外の握りつぶし — なし
- [x] 暗黙的型変換 — strict mode + union type 分岐
- [x] ログレベル — 構造化 JSON log。起動時の config 値出力にマスク不足あり

---

## 2. データスキーマの妥当性・重複確認 (Data Schema Validation)

| テーブル / モデル | 問題種別 | 説明 | 推奨対応 |
|-----------------|---------|------|---------|
| users | 正規化不足・legacy 混在 | name/email/role/passwordHash/google_* は Cernere 移管で不要だが DROP COLUMN ルール違反で残置。新規コードは読み書き禁止の運用。 | migration job で legacy column を view に隔離、または ALTER TABLE RENAME を段階実行 |
| tasks | 正規化適切 / 制約完備 | ownerId/assigneeId/groupId の FK 設定。status/priority enum で正規化。deadline nullable。 | idx_tasks_ownerId / idx_tasks_status / idx_tasks_deadline の確認で性能最適化 |
| module_states | 設計完備 | moduleId / scopeType / scopeId で 3 階層スコープ。unique constraint で重複防止。 | なし。スキーマ良好 |
| sessions | 正規化適切 | refreshToken unique。userId FK。expiresAt で自動削除候補。 | 大量セッション時のテーブル肥大化対策 (archival job) を検討 |

### チェック項目

- [x] 正規化 — tasks.status enum / FK で適切
- [x] 同一概念の複数定義 — pm_tasks は tasks と pluginRef で疎結合。設計妥当
- [x] フィールド型適合 — deadline timestamp / status・priority text enum
- [x] 制約設定 — NOT NULL / UNIQUE / FK references 完備
- [x] インデックス — spec/dbs/*.md で定義。query plan での検証が ideal
- [x] マイグレーション破壊性 — 4 コミットで DROP TABLE。分離ブランチ戦略で許容
- [x] API schema 矛盾 — request body ↔ DB column 対応確認
- [x] Enum 定義一致 — VALID_STATUSES (routes 定数) vs DB schema enum の手書き一致確認が必要
- [x] N+1 — taskRepo.list() は一度の SELECT で全取得

---

## 3. SRE 観点のレビュー (SRE Review)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 可観測性 | 構造化 JSON log (src/app.ts:76-86) で ts/method/path/status/durationMs/userId/error 記録。requestId middleware で trace 連携可能。分散 tracing なし。 |
| A | デプロイ安全性 | scripts/ci-check.sh で build/test/lint/frontend build を自動化。Drizzle migrate で schema version 管理。 |
| B | スケーラビリティ | ステートレス API 設計（session は Redis 外出し）。rate-limit が inメモリ (pod local) なので multi-instance で bypass 可能。Redis rate-limit 移行を推奨。 |
| B | 障害復旧 | db-export script あり。Redis は session のみで再生成可能。RTO/RPO 明示なし。 |
| A | 依存関係管理 | package-lock.json で lock。docker base image は node:22 で pin。CVE scan CI なし（改善点）。 |

### チェック項目

- [x] 構造化ログ — JSON format。log aggregator 対応
- [x] メトリクス — prometheus exporter なし
- [x] health check endpoint — /api/health なし。K8s probe 対象外。追加を推奨
- [x] ロールバック可能 — git revert。DB migration rollback は drizzle-kit で手動
- [x] 設定無-reload — env-cli で起動時 load。runtime config change なし
- [x] リソース制限 — docker-compose の memory/cpu limit 確認が必要
- [x] 水平スケーリング — ステートレス API。rate-limit local counter → 改善点
- [x] backup/restore — db-export.ts / redis-export.ts あり。cron 化なし
- [x] SLI/SLO — 未定義
- [x] インシデント runbook — なし

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | コード品質 | B | 0 |
| 2 | データスキーマ | B | 1 |
| 3 | SRE | B | 0 |

**所見:** コード品質は strict TypeScript で良好。データスキーマは tasks/module_states/sessions が堅牢だが users legacy column が課題。SRE は health endpoint / rate-limit Redis 統合 / npm audit CI / runbook 作成を推奨。
