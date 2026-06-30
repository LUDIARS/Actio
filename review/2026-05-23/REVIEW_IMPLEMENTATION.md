# Web 実装評価 — Actio (2026-05-23)

## 1. コード品質 (B)

| 該当箇所 | 問題分類 | 説明 |
|----------|---------|------|
| `src/db/repository.ts` (2391 行) | サイズ過大 | entity 別 (user/task/pm) に分割推奨。`src/db/repositories/*.ts` 構成 + barrel export |

- マジックナンバー: constants.ts で `PERIODS_COUNT`, `DAY_LABELS` 定義済 (src/shared/constants.ts)
- TypeScript strict mode、any 型は 12 個 (少)、type guard pattern 多用
- 例外握りつぶしなし、ログ階層化 (info/warn/error)
- frontend 側に split-task-only で削除されたページの dead import が残存可能性

## 2. データスキーマ (B)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 正規化 | Task / PM project / Task snapshot 分離、task_snapshots で task_id 複製 (denormalize) |
| B | Legacy column | 個人情報 (name/email/password_hash) は DROP 禁止規則で残存。マイグレーション戦略未文書化 |
| A | FK 無関連性 | user_id は FK、group_id 等の親子は constraint |
| B | Index | task.created_by, task.group_id 等の index 明示文書なし (spec/dbs/*.md 参照推奨) |

**指摘**: legacy column (password_hash / google_*) のマイグレーション計画文書化 (spec/db-migration.md)

## 3. SRE (B)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | ログ | 構造化 JSON、requestId 追跡可能 (src/app.ts:78-88) |
| B | デプロイ | Docker Compose 管理、CI は test.yml のみ、デプロイ自動化未整備 |
| B | 障害対応 | activity-logger あるが alert/自動復旧/Prometheus 未統合 |
| A | セキュリティパッチ | npm audit 可能、CI 未統合 |

**指摘**: Prometheus exporter (http_requests_total / response_time_ms) + readiness probe + デプロイ自動化パイプライン推奨
