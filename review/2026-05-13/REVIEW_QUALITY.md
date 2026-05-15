# 品質保証レビュー (Quality Assurance Review) — Actio

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | main (HEAD `cbcb692`) |
| レビュー実施日 | 2026-05-13 |
| 対象コミット範囲 | 直近 50 commit |

---

## 1. テスト戦略・カバレッジ (Test Strategy & Coverage)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | unit テストの網羅性 | `tests/placement-engine.test.ts` で haversine / findCurrentPlace / diffTransitions を pure 関数で検証。 `tests/plugin-extensions.test.ts` / `plugin-security.test.ts` / `plugin-verification.test.ts` で SDK loader を検証。 `db-scope.test.ts` で repository |
| B | integration テストの網羅性 | `tests/api/*.test.ts` 14 ファイル (auth, calendar, groups, health, m1-school, module-admin, myplan, notification, plugin-ext-api, reservation, settings, smart-scheduler, tasks, voting)。 SQLite in-memory ベース |
| D | E2E テストの存在 | Playwright / Cypress 等の E2E 無し。 frontend は `cd frontend && npm run build` のみ |
| B | エッジケース・境界値テスト | placement-engine の `null` transition / 同一 place 維持パターンは網羅。 lat/lon の境界 (±90/±180) ケースは見当たらず |
| A | CI でのテスト自動実行 | `scripts/ci-check.sh` で 4 step (backend build / test / frontend lint / frontend build) を CI + pre-push hook が共有 (#test.yml) |

### チェック項目

- [x] コアロジック unit テスト
- [x] 外部 I/O 含む integration テスト (in-memory SQLite)
- [ ] E2E / smoke test 不在
- [ ] 並行性テスト (placement_state の同時 upsert) 未実装
- [x] 失敗系: hook event != enter/leave、 invalid JSON 等
- [x] CI で毎コミット green 強制 (.claude/settings.json + workflow)
- [ ] flaky test 検出プロセス 未設定
- [ ] カバレッジ計測ツール: vitest --coverage の出力先未設定
- [ ] contract test: Cernere / Nuntius / Iv との界面契約テスト 未整備
- [x] OS matrix: 開発は Windows / Linux 両方稼働確認、 CI は ubuntu-latest のみ

---

## 2. パフォーマンス・ベンチマーク (Performance & Benchmark)

| 評価 | 観点 | 所見 |
|------|------|------|
| D | パフォーマンス要件の明文化 | SLO / レイテンシ目標が docs / spec に無し |
| D | ベンチマーク実装 | `vitest bench` / `autocannon` / `k6` の類なし |
| D | プロファイリング | flamegraph / clinic.js の運用記述なし |
| D | 性能リグレッション検知 | CI で latency 計測なし |
| C | 大規模データ・高負荷時の挙動 | placement の `findCurrentPlace` は O(N place per user)、 一般ユーザでは 10〜30 で問題なし。 calendar の月単位取得などは件数次第 |

### チェック項目

- [ ] レイテンシ目標未文書化
- [ ] ベンチマークなし
- [ ] プロファイリング前提なし
- [ ] CI リグレッション検知なし
- [ ] 大量同時接続: WebSocket は単プロセスバインド、 検証なし
- [ ] メモリリークの確認なし (活動ログが in-memory 100 件で循環、 リーク懸念低)
- [x] キャッシュ: Redis セッションキャッシュは導入済
- [x] 起動時間: tsx watch + SDK 自動ビルドで dev 体験は良好
- [ ] モバイル消費電力 (frontend PWA) の検証なし

---

## 3. ライセンス遵守・OSS 帰属表示 (License Compliance)

| 該当依存 | ライセンス | 配布形態 | 互換性評価 | 帰属表示状態 |
|---------|----------|---------|-----------|-------------|
| `hono`, `@hono/node-server`, `@hono/node-ws` | MIT | static (npm install) | OK | 未対応 (NOTICE 無) |
| `drizzle-orm`, `drizzle-kit` | Apache-2.0 | static | OK | 未対応 |
| `bcryptjs`, `jsonwebtoken`, `ws`, `uuid`, `ioredis`, `postgres`, `mysql2`, `better-sqlite3` | MIT/Apache-2.0 | static | OK | 未対応 |
| `@aws-sdk/client-ssm` | Apache-2.0 | static | OK | 未対応 |
| `@ludiars/*` (cernere-id-cache, schedula-sdk, schedula-module-*) | 自社 (MIT 想定) | static (GitHub Packages) | OK | OK (社内) |
| `csv-parse` | MIT | static | OK | 未対応 |

### チェック項目

- [x] プロジェクト LICENSE: MIT、 `LICENSE` ファイル + README に明記
- [x] 依存パッケージのライセンス: GPL の取り込み無し
- [ ] NOTICE / THIRD_PARTY_LICENSES ファイル未生成 (B 評価)
- [-] CLA / DCO 未運用 (社内 LUDIARS org のため不要)
- [-] プロプライエタリ依存: 無し
- [x] copyleft 混入なし (cargo-deny 同等の license-checker 未実行ながら手動確認で MIT/Apache のみ)
- [x] フォント・アイコン: Lucide React (ISC) で再配布 OK
- [ ] AI 生成コード方針 未明文化 (LUDIARS 全体ポリシーに従う前提)

---

## 4. クロスプラットフォーム互換 (Cross-Platform Compatibility)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | パス区切り・大文字小文字の扱い | TypeScript ESM、 `path.join` 系直接使用は少なめ。 better-sqlite3 等のネイティブモジュールあり (`postinstall` でビルド) |
| B | プロセス・IPC の OS 別実装 | OS 別 IPC 未使用、 WebSocket と HTTP のみ。 Docker 経由運用が前提 |
| B | 文字エンコーディング・改行コード | `.gitattributes` で eol 制御は未設定 (推定)。 CRLF/LF 由来の bash script トラブルは scripts/ で `bash` 明示 |
| B | ビルドツールチェーン | Node.js v22+ (`.nvmrc`)、 npm workspaces、 docker buildx (linux/amd64 想定) |
| C | CI でのマトリクス実行 | `.github/workflows/test.yml` は ubuntu-latest のみ。 Windows / macOS マトリクス無し |

### チェック項目

- [x] `path.join` 系を使用 (直接 `/` 使用なし)
- [x] ファイル名の大文字小文字依存なし (Node ESM の import path で問題なし)
- [-] CRLF/LF: scripts/ は bash 明示 (Windows でも git-bash で OK)
- [x] OS 別 IPC 抽象化: 不要
- [-] ネイティブ依存: `better-sqlite3` (prebuilt あり)、 `bcryptjs` (pure JS) なので OS 跨ぎ可
- [ ] CI matrix: Linux only (B-)
- [ ] arm64 ビルド未確認
- [x] 環境変数: `secretManager` 経由で一元化、 OS 差なし
- [x] README に Node.js v22+ / Docker / Infisical 等の前提明記

---

## 5. ドキュメント完備性 (Documentation Completeness)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | README の網羅性 | 特徴 / 技術スタック / プロジェクト構造 / セットアップ手順 / Cernere / env-cli / Docker / モジュール一覧まで丁寧 |
| A | DESIGN / アーキテクチャ図 | `DESIGN-facility-booking-plugin.md` / `system-design-v1.1.md` / `spec/` 配下に core + module で各 4 種ドキュメント (spec / usecase / dbschema / code) が揃う |
| C | API リファレンス | OpenAPI / typedoc 自動生成なし。 `spec/dbs/*.md` で DB 表は自動同期 (`db-schema-docs` skill) |
| B | inline コメントの粒度 | placement / composite / forwarder などモジュール先頭に責務コメント、 JSDoc は最小限 |
| B | 開発者向け CONTRIBUTING / ランブック | `CLAUDE.md` が AI 向けに非常に詳細。 人間向け CONTRIBUTING.md 単体は無いが README + CLAUDE で代替 |

### チェック項目

- [x] README 起動手順 ok
- [x] DESIGN.md / spec/* の階層整備
- [ ] API リファレンス自動生成なし
- [ ] doc コメント (JSDoc) は 一部のみ
- [ ] CHANGELOG なし (git log で代替)
- [x] Cernere / Nuntius 連携手順は README + CLAUDE で言及
- [ ] トラブルシューティング・ランブック 未整備
- [-] examples: `modules-ext/example` あり
- [-] アーキテクチャ図 (Mermaid) は spec/ 内に部分的
- [-] ドキュメント実装乖離: 旧 Schedula 残置 (README ln94: `cd Schedula`)、 spec/dbs に machina_* がレガシーで残る

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | テスト戦略・カバレッジ | B | 0 (E2E 不在は減点要因) |
| 2 | パフォーマンス・ベンチマーク | C | 0 (SLO 未定義) |
| 3 | ライセンス遵守 | B | 0 (NOTICE 未生成) |
| 4 | クロスプラットフォーム | B | 0 (CI matrix が Linux のみ) |
| 5 | ドキュメント完備性 | B | 0 (API リファレンス自動化なし) |

**評価基準:** A=ベストプラクティス準拠 / B=軽微改善 / C=改善推奨 / D=重大問題
