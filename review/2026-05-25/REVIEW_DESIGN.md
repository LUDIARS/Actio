# 設計レビュー — Actio (2026-05-25)

## 対象

| 項目 | 値 |
|------|-----|
| リポジトリ | Actio |
| 対象ブランチ | main (c959421..857bdac) |
| レビュー実施日 | 2026-05-25 |
| 対象コミット範囲 | `857bdac` (test: paseto-verify) |

---

## 1. 設計強度 (A)

### 検証観点：テストアーキテクチャの堅牢性

| 観点 | 評価 | 所見 |
|------|------|------|
| 障害分離 | A | Module-level keyCache の隔離 (vi.resetModules()) により、各テストがフレッシュな環境で実行。fetch mock の call count tracking で state pollution なし |
| 冪等性 | A | 各テスト case は symmetric setup + teardown (beforeEach / afterEach) を持ち、複数回実行可能 |
| 入力バリデーション | A | token format (v4.public prefix)、audience mismatch、kind validation、expiry の検証が 11 ケースに分散して検証済み |
| エラーハンドリング | A | fetch 失敗時の graceful fallback (cache 維持) が §6 で明示的にテスト。 verify 失敗時は null return で HS256 fallback を許容 |
| リトライ・タイムアウト設計 | A | 公開鍵 refresh は 6h interval + exponential backoff 不要 (fetch 失敗時は cache 維持)。試行錯誤のない linear kid iteration は tolerable な設計 |
| 状態管理の明確性 | A | keyCache, refreshTimer, optsRef の 3 state は module-level で明示的に管理。init 前 call に対する null guard は consistent |

---

## 2. 設計思想の一貫性 (A)

### 検証対象：テスト design conventions

| 該当箇所 | 設計思想 | 準拠評価 |
|----------|---------|---------|
| `tests/auth/paseto-verify.test.ts:96-108` | 非同期テストの synchronization | A — waitForFetchCalls + waitForCacheSize helper により、race condition を明示的に排除 |
| `tests/auth/paseto-verify.test.ts:25-28` | Fresh module import | A — vi.resetModules() で cache isolation。Actio の既存テスト慣習 (modules/* のテスト) と一貫 |
| `tests/auth/paseto-verify.test.ts:74-85` | Mock strategy | A — fetch mock は URL validate + response shape cast。Vitest standard patterns に準拠 |
| `tests/auth/paseto-verify.test.ts:271-295` | Safe defaults検証 | A — payload 欠落時の動作を明示テスト。DESIGN.md §「個人データ保管禁止」に準拠 (role: "general" 等のデフォルト値が secure) |

---

## 3. モジュール分割度 / 機能的凝集度 (A)

### 単位：テストスイート

| モジュール | 凝集度 | 所見 |
|-----------|--------|------|
| paseto-verify.test.ts (11 tests) | 機能的 | 単一責務：PASETO V4 token verification の入出力正当性を網羅。setup / verify / rotate の 3 phase で organize |
| helper functions (loadModule / generateKeypair / signToken) | 機能的 | Fixture 責務に集中。test case 本体との coupling は minimal |
| mock functions (mockFetchReturns / mockFetchFails) | 機能的 | fetch layer の mock に特化。test case での reuse が clean |

### 結合度

- **テスト cases 間結合度**：低。各テストが独立した keypair / token を生成。state sharing は intentional（キャッシュ isolation via resetModules で排除）
- **実装への結合度**：Controlled coupling。public API (startPasetoVerify, verifyPasetoToken) のみに依存。internal state (keyCache) への direct access は diagnostic helper (pasetoKeyCacheSize) に限定

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | 設計強度 | A | 0 |
| 2 | 設計思想の一貫性 | A | 0 |
| 3 | モジュール分割度 | A | 0 |

**コメント**：本テストスイートは既存実装 (src/auth/paseto-verify.ts) の設計を間接的に validate する。テスト自体の設計も堅牢で、cache isolation, mock strategy, edge case coverage が完備されている。
