# 品質保証レビュー — Actio (2026-05-24)

## 1. テスト戦略・カバレッジ (C)

| 評価 | 観点 | 所見 |
|------|------|------|
| C | unit テスト | 13 ファイル維持 (db-scope / plugin-extensions / plugin-security / plugin-verification / service-adapter)、 カバレッジ未測定。 **本周期 +1700 LOC (PASETO verify + corpus manifest + corpus-renderer vendor + declarative bootstrap) に対しテスト追加 0 件** |
| C | integration | tests/api/ 維持、 PASETO 経路を含む `/api/*` 認証フロー (PASETO success / PASETO invalid → HS256 fallback / 両失敗 → anonymous) の e2e 観点が新規追加されていない |
| B | E2E | frontend は Vitest、 E2E (Playwright/Cypress) 未統合。 declarative.html β 経路 (multi-entry) の smoke test なし |
| B | エッジケース | plugin-security でエッジケース検証、 task 状態遷移境界値テスト未明示 |
| B | CI 自動実行 | test.yml で npm test、 PR merge ブロック条件未確認。 vendor copy drift 検知も未統合 |

**指摘 (新規 3 件)**:
1. `src/auth/paseto-verify.ts` の unit テスト追加 — `verifyPasetoToken` の (a) 正規 v4.public token (b) audience mismatch (c) kind != user_for_project (d) sub 欠落 (e) prefix 不一致 → null fallback (f) kid cache empty 時 5 ケース
2. `src/middleware/auth.ts` の 2 段検証 integration テスト — PASETO 成功 → HS256 fallback → dev header → anonymous の 4 経路を 1 ファイルに集約
3. `frontend/src/declarative.ts` の vitest jsdom smoke test — manifest mock + me mock + renderPanel が `#root` 配下に form/list を生成することを確認

## 2. ライセンス遵守 (A)

| 該当依存 | ライセンス |
|---------|----------|
| hono | MIT |
| drizzle-orm | Apache 2.0 |
| bcryptjs / ioredis / jsonwebtoken / better-sqlite3 | MIT |
| postgres / mysql2 | MIT |
| **paseto** (新規) | MIT |

LICENSE (MIT) あり。 THIRD_PARTY_LICENSES 未生成 (npm license-checker 自動化推奨、 前回継続)。 corpus-renderer の vendor copy は LUDIARS/Corpus (同 org) からの copy で license-compat 上の懸念なし、 ただし `vendored copy of LUDIARS/Corpus` の出典明記 (renderer.ts:1) は保たれている。

## 3. ドキュメント完備性 (B)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | README | 構造説明あり、 split-task-only 後の dated 情報の更新は前回からの継続課題 |
| B | DESIGN | CLAUDE.md で代替、 Actio 専用 DESIGN.md 推奨。 corpus declarative 統合の方針 (Corpus DESIGN.md §13.8 step 4) を Actio 側にも 1 セクションで要約推奨 |
| A | API リファレンス | `frontend/src/lib/api.ts` に exported、 Swagger は無。 declarative panel の API は corpus-service.json で機械可読 |
| B | inline | paseto-verify.ts は冒頭 14 行の説明 + 設計判断 (line 13-16) で良好。 corpus.ts も top-of-file comment あり。 repository.ts は不足のまま |
| C | CONTRIBUTING | CLAUDE.md のみ、 onboarding/troubleshooting 専用 doc 未作成 |

**指摘**: `spec/declarative-ui.md` (新規) で declarative.html β / vendor copy の drift 検知方法 / Corpus DESIGN.md §13 への参照を 1 ページに集約推奨。

## 4. パフォーマンス (B)

- durationMs ロギング (src/app.ts:67-90)、 SLA 未定義
- user info は Redis cache、 task list はキャッシュ未適用
- WebSocket bulk batch 未実装 (one-request-one-command)
- 新規 PASETO 経路: kid cache に対し線形 verify (paseto-verify.ts:96-120)。 kid 数が < 10 程度なら 1 request あたり sub-millisecond。 ただし VULNERABILITY §3 の懸念あり
- declarative.html bundle = 13.68 KB (PR #130 検証ログ) — main bundle と独立で、 Corpus hub 用途に最適

## 5. クロスプラットフォーム (B)

- Node.js + Docker クロスプラットフォーム
- scripts/setup.sh / ci-check.sh は bash 依存 (Windows は Git Bash 必須)
- browserslist 未指定
- frontend に useIsMobile + manifest.webmanifest あり
- vite multi-entry (vite.config.ts:39-46) は browser 環境差なく動作、 declarative.html bootstrap は cookie credentials:'include' で main SPA と認証セッション共有可能
