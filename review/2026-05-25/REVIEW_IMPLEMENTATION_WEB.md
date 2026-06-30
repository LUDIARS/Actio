# Web 実装評価 — Actio (2026-05-25)

## 対象

| 項目 | 値 |
|------|-----|
| リポジトリ | Actio |
| 対象ブランチ | main (c959421..857bdac) |
| レビュー実施日 | 2026-05-25 |
| 対象コミット範囲 | `857bdac` (tests/auth/paseto-verify.test.ts) |

---

## 1. データスキーマの妥当性・重複確認 (A)

### テストコード

| テーブル / モデル | 問題種別 | 説明 | 推奨対応 |
|-----------------|---------|------|---------|
| PasetoIdentity (interface) | — | userId / role / displayName / projectKey の 4 フィールド。型妥当。重複なし | — |
| SignOpts (test interface) | — | token 생成时 payload option 정의. CWE-347 (weak crypto) 관점에서 무관 | — |
| KeyEntry (module internal) | — | key (Buffer) + fetchedAt (number). 공개鍵 cache entry로 정규화 적절 | — |

### テスト対象実装のスキーマ

| テーブル | 問題評価 | 所見 |
|----------|---------|------|
| keyCache (Map<string, KeyEntry>) | A | kid (string) → key (Buffer) の 1:1 mapping。重複なし。fetchedAt で cache age 관리 가능 |
| optsRef (PasetoVerifyOptions \| null) | A | global init state。null guard で NPE 回避。audience/cernereBaseUrl の normalize済み |

---

## 2. SRE観点のレビュー (A)

### 可観測性 (Observability)

| 観点 | 評価 | 所見 |
|------|------|------|
| **ログ出力** | A | paseto-verify.ts:46-49 (init warning), 80 (refresh log), 82-83 (error log) で구조화되지 않았지만 readable. 테스트 scope에서는 console output control 가능 |
| **トレースID** | B | module level 수준. requestId middleware (별도, src/app.ts:67-90) 와 연계 필요 (미보유) |
| **メトリクス** | B | paseto lib verify 시간 / kid cache hit rate / fetch latency 등 수집 대상 (현재 미통계) |
| **ヘルスチェック** | A | `/api/auth/health` 등 별도 endpoint 불필요 (init 실패시 console.warn + null path로 fallback) |

### デプロイ安全性

| 観点 | 評価 | 所見 |
|------|------|------|
| **ロールバック可能性** | A | node process 재시작으로 cache 재구축. 상태 유지 없음 |
| **設定変更の反映** | B | CERNERE_URL, ACTIO_PUBLIC_URL 은 env 기반이므로 hot reload 불가. process restart 필요 |
| **Blue-Green Deployment** | A | stateless design. kid cache 는 새 process 가 fetch로 rebuild 가능 |

### スケーラビリティ

| 観点 | 評価 | 所見 |
|------|------|------|
| **水平スケーリング** | A | Node.js worker process 간 public key cache 는 독립적 (각자 6h 주기로 refresh). sync 불필요 |
| **캐시 효율성** | A | keyCache 는 メモリ内. 크기 제한 있음 (paseto lib kid count ~< 10개 일반적). 메모리 pressure 낮음 |
| **리소스 제한** | B | CPU (verify 연산량) / memory (cache size) 제한 미설정. PASETO 무효 token 대량投与시 CPU 선형증가 (전회指摘) |

### 障害復旧 (Disaster Recovery)

| 観点 | 評価 | 所見 |
|------|------|------|
| **フェイルセーフ** | A | fetch 실패 → cache 유지. expiry token → null (HS256 fallback). 모두 안전한 default |
| **バックアップ・リストア** | A | cache 는 휘발성 (메모리). backup 불필요. recovery = process restart 후 fetch refresh |

### 依存関係管理

| 観点 | 評価 | 所견 |
|------|------|------|
| **외부서비스 의존** | A | Cernere `/.well-known/cernere-public-key` fetch만 의존. 단일 URL에 집중 가능 |
| **라이브러리 버전** | A | paseto@^3.1.4 pinned. node:crypto는 built-in. transitive dependency minimal |

---

## 총合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | データスキーマ | A | 0 |
| 2 | SRE | A | 0 |

**コメント**：テスト対象モジュール (paseto-verify.ts) は SRE 기준에 부합. 단, 본테스트 자체 (テストコード) 의 SRE 는 local test environment 가정하므로 observability/metrics 미도입. 프로덕션 모니터링은 별도 instrumentation 필요.
