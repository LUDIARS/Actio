# 品質保証レビュー — Actio (2026-05-23)

## 1. テスト戦略・カバレッジ (C)

| 評価 | 観点 | 所見 |
|------|------|------|
| C | unit テスト | 13 テストファイル (db-scope/plugin-extensions/plugin-security/plugin-verification/service-adapter)、カバレッジ未測定 |
| C | integration | tests/api/ 存在、全 API カバレッジ確認要 |
| B | E2E | frontend は Vitest、E2E (Playwright/Cypress) 未統合 |
| B | エッジケース | plugin-security でエッジケース検証、task 状態遷移境界値テスト未明示 |
| B | CI 自動実行 | test.yml で npm test 実行、PR merge ブロック条件未確認 |

**指摘**: `vitest run --coverage` 計測 + integration/E2E 補強

## 2. ライセンス遵守 (A)

| 該当依存 | ライセンス |
|---------|----------|
| hono | MIT |
| drizzle-orm | Apache 2.0 |
| bcryptjs / ioredis / jsonwebtoken / better-sqlite3 | MIT |
| postgres / mysql2 | MIT |

LICENSE (MIT) あり。THIRD_PARTY_LICENSES 未生成 (npm license-checker 自動化推奨)。

## 3. ドキュメント完備性 (B)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | README | 構造説明あり、split-task-only 後の dated 情報の更新要 |
| B | DESIGN | CLAUDE.md で代替、Actio 専用 DESIGN.md 推奨 |
| A | API リファレンス | frontend/src/lib/api.ts に exported、Swagger は無 |
| B | inline | plugin loader / WS dispatcher / auth に注釈、repository.ts は不足 |
| C | CONTRIBUTING | CLAUDE.md のみ、onboarding/troubleshooting 専用 doc 未作成 |

**指摘**: README を split-task-only 反映に更新、DESIGN.md 新規、CHANGELOG.md 開始 (semantic versioning)

## 4. パフォーマンス (B)

- durationMs ロギング (src/app.ts:78-88)、SLA 未定義
- user info は Redis cache、task list はキャッシュ未適用
- WebSocket bulk batch 未実装 (one-request-one-command)

## 5. クロスプラットフォーム (B)

- Node.js + Docker クロスプラットフォーム
- scripts/setup.sh / ci-check.sh は bash 依存 (Windows は Git Bash 必須)
- browserslist 未指定
- frontend に useIsMobile + manifest.webmanifest あり
