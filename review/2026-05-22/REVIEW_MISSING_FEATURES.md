# Actio コードレビュー — REVIEW_MISSING_FEATURES.md (2026-05-22)

## 対象情報

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ | feat/split-task-only |
| レビュー実施日 | 2026-05-22 |
| 対象コミット範囲 | latest (0436ecd) |

---

## 1. 機能の改善提案 (Feature Improvement)

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| PM モジュール (GitHub/Notion 同期) | N+1 クエリ最適化: `relational()` mode で batch fetch | response time 削減。大規模プロジェクトで体感向上 | High |
| Task キャッシング | Redis に task データを TTL 付きで cache。CRUD で invalidate | API response 平均 50ms → 10ms。並行読み取り時の DB 負荷軽減 | High |
| API リファレンス自動生成 | OpenAPI 3.0 spec を Hono route から自動生成 | Postman collection 自動 import + client SDK 生成可能 | Medium |

---

## 2. 不足機能の提案 (Missing Feature Proposal)

| 提案機能 | 必要性の根拠 | 実装優先度 | 想定影響範囲 |
|---------|------------|-----------|------------|
| E2E テスト (Playwright) | CI に E2E テストなし。task CRUD + PM 同期の整合性を自動検証する手段がない | High | tests/ + CI github workflow |
| パフォーマンスベンチマーク測定 | リリース要件が不明。負荷試験で目標 latency / throughput を定義すべき | High | scripts/ + CI pipeline |
| 権限モデルの細粒度化 | 現在は admin/general のみ。PM は project owner / task assignee で権限分離する必要 | Medium | modules/pm/ + middleware |
| 監査ログ詳細化 | 操作ログは activity-logger (ファイルベース)。DB 操作を who/what/when/result で記録し query 可能化 | Medium | src/ + spec schema |

---

## 総合評価

| # | レビュー観点 | 指摘数 | 優先度別内訳 |
|---|------------|--------|------------|
| 1 | 機能改善 | 3 | High: 2 / Medium: 1 / Low: 0 |
| 2 | 不足機能 | 4 | High: 2 / Medium: 2 / Low: 0 |

## まとめ

Actio はタスク管理専用プラットフォームとして成熟。split-task-only による責務明確化が完了し、個人データ保管禁止ルール遵守も確立されている。改善点は運用信頼性領域 (E2E テスト・負荷試験・権限細粒度化) に集中。リリース前に High 優先度 (権限モデル拡張、N+1 クエリ最適化) の対応を推奨。
