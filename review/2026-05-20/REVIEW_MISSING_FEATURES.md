# 不足機能評価（共通）(Missing Feature Evaluation) — Actio

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | feat/split-task-only |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 15261cd .. 8b2dfcb |

---

## 1. 機能の改善提案 (Feature Improvement)

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| GET /api/tasks/:id 所有権チェック | owner/assignee/groupMember 検証を追加 | IDOR 防止。オブジェクトレベル認可の完成度向上。 | High |
| Rate limiting (inメモリ) | Redis backed rate limit に移行 | 分散環境での rate limit 一貫性。DDoS 対策強化。 | Medium |
| npm audit CI | GitHub dependabot または npm audit CI job 追加 | 既知脆弱性の早期検出。 | High |
| Health check endpoint (/api/health) | { status, db, redis } を返す GET /api/health | Kubernetes readiness/liveness probe 対応。 | Medium |
| OpenAPI / Swagger spec | openapi.yaml の生成 | API クライアント生成・外部連携ドキュメント化。 | Low |
| Task 拡張 (category/label/repeat/subtask) | task model に分類・繰り返し・分解を段階追加 | ユーザビリティ向上。 | Low |

---

## 2. 不足機能の提案 (Missing Feature Proposal)

| 提案機能 | 必要性の根拠 | 実装優先度 | 想定影響範囲 |
|---------|------------|-----------|------------|
| Input validation 強化 (deadline future check) | deadline が過去日付でも accept。タスク deadline は future 前提が慣例。 | High | modules/task/routes.ts:105-109 (parseDate 強化) |
| Error ID logging & monitoring | 500 error に error ID を付与し、log aggregator で trace 可能化 | Medium | src/app.ts:42-48 (onError) |
| Audit logging for sensitive operations | module enable/disable / task delete の structured audit log | Medium | src/activity-logger.ts + audit table |
| Task bulk operations | POST /api/tasks/bulk で複数 create/update を atomically 実行 | Low | modules/task/routes.ts |
| CORS dynamic origin validation | request Origin header での動的検証 | Low | src/app.ts:90-94 |

---

## 総合評価

| # | レビュー観点 | 指摘数 | 優先度別内訳 |
|---|------------|--------|------------|
| 1 | 機能改善 | 6 | High: 2 / Medium: 2 / Low: 2 |
| 2 | 不足機能 | 5 | High: 1 / Medium: 2 / Low: 2 |

**優先度根拠:** High はセキュリティ (IDOR/CVE) と運用 (health check) に直結。Medium はパフォーマンス・監査・レジリエンス。Low は UX・API completeness。
