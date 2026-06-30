# Actio コードレビュー — REVIEW_QUALITY.md (2026-05-22)

## 対象情報

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ | feat/split-task-only |
| レビュー実施日 | 2026-05-22 |
| 対象コミット範囲 | latest (0436ecd) |

---

## 1. テスト戦略・カバレッジ (Test Strategy & Coverage)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | unit テストの網羅性 | 13 suites, 102 tests all passing。主に plugin / security / verification テスト。core task CRUD テストは拡張余地あり |
| C | integration テストの網羅性 | DB + Redis を含む integration test 有 (db-scope.test.ts)。全 API endpoint 網羅していない |
| B | E2E テストの存在 | E2E テストなし。CI の ci-check.sh は build + lint のみ |
| B | エッジケース・境界値テスト | plugin verification で manifest 検証テスト有。タイムゾーン・大量データ・並行アクセステストは未実装 |
| C | CI でのテスト自動実行 | vitest は通常実行。リグレッション検知 / パフォーマンス benchmark test なし |

**評価:** B。基本的なテストは揃っているが、E2E と大規模データテストが不足。

---

## 2. ライセンス遵守・OSS 帰属表示 (License Compliance)

| 該当依存 | ライセンス | 配布形態 | 互換性評価 | 帰属表示状態 |
|---------|----------|---------|-----------|-------------|
| `hono` | MIT | dynamic (SPA) | OK | LICENSE ファイルで統括 |
| `drizzle-orm` | Apache 2.0 | dynamic | OK | LICENSE に明記推奨 |
| `jsonwebtoken` | MIT | dynamic | OK | LICENSE に明記推奨 |
| `bcryptjs` | MIT | dynamic | OK | LICENSE に明記推奨 |
| `@ludiars/*` modules | MIT | dynamic (npm workspace) | OK | LICENSE に明記推奨 |
| `ws` | MIT | dynamic | OK | LICENSE に明記推奨 |

- ✅ プロジェクトライセンス: MIT 明記 (LICENSE ファイル有)
- ⚠️ 依存ライセンス帰属: README / LICENSE に依存パッケージのライセンス表示なし。`license-checker` 等で自動チェック推奨

**評価:** A。基盤は正しいがドキュメント整備推奨。

---

## 3. ドキュメント完備性 (Documentation Completeness)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | README の網羅性 | 前置き・セットアップ・技術スタック・構造は詳しい。split-task-only 後の全体像が古い (予定系記載が残存) |
| B | DESIGN / アーキテクチャ図 | DESIGN-facility-booking-plugin.md (旧 M4) が残存。split-task-only 後の全体 DESIGN.md がない |
| B | API / インターフェースリファレンス | REST API ドキュメントが分散 (spec/ と modules/*/PLAN.md)。OpenAPI 自動生成なし |
| A | inline コメント | 関数・型に JSDoc / 説明コメント有。複雑な PM ロジック・WS dispatcher は説明不足 |
| B | 開発者向け CLAUDE.md / ランブック | CLAUDE.md は充実。障害時ランブックなし |

**評価:** B。基盤はあるが、split-task-only 後の全体設計書と API リファレンス自動生成を推奨。

---

## 4. Web 品質保証

### パフォーマンス・ベンチマーク

| 評価 | 観点 | 所見 |
|------|------|------|
| C | パフォーマンス要件の明文化 | リリース要件書なし。想定ユーザー数・同時接続数が不明 |
| C | ベンチマーク・負荷試験 | 負荷試験スクリプトなし。Redis / PostgreSQL リソース制限が未定義 |
| C | プロファイリング | CPU / メモリ / I/O プロファイリング未実施。スロークエリ検出なし |
| D | 性能リグレッション検知 | CI でパフォーマンス測定なし |
| C | 高負荷・大規模データ時の挙動 | 数千タスク × 数千ユーザー時の動作未検証 |

#### 主要指摘

- **High: N+1 クエリの放置** — PM モジュールが GitHub/Notion から大量 pull する際の query 最適化が未確認。Drizzle relations を活用した batch fetch 推奨
- **High: キャッシュ戦略不明** — Redis は session のみ。task データのキャッシュ層がない

**評価:** C

### クロスプラットフォーム互換

| 評価 | 観点 | 所見 |
|------|------|------|
| A | サーバランタイム / OS 差 | Node.js v22+ で固定。Dockerfile は alpine-node で統一 |
| A | ブラウザ互換 | React 19 + モダン JS (ES2020) |
| A | 文字エンコーディング・タイムゾーン | UTF-8 統一。タイムゾーン: UTC 基準 + reminder timezone 別設定 |
| A | コンテナ・ビルド再現性 | package-lock.json + drizzle-kit lock で再現可能 |
| C | CI でのマトリクス実行 | Linux (Alpine) only。macOS / Windows test なし |

**評価:** A (マトリクス CI 除く)

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | テスト戦略・カバレッジ | B | 1 |
| 2 | ライセンス遵守 | A | 0 |
| 3 | ドキュメント完備性 | B | 2 |
| 4 | パフォーマンス・ベンチマーク | C | 2 |
| 5 | クロスプラットフォーム互換 | A | 0 |
