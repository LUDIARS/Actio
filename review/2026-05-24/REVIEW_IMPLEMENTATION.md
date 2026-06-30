# Web 実装評価 — Actio (2026-05-24)

## 1. コード品質 (B)

| 該当箇所 | 問題分類 | 説明 |
|----------|---------|------|
| `src/db/repository.ts` (2391 行) | サイズ過大 | entity 別 (user/task/pm) に分割推奨。 前回からの継続課題、 本周期は repository.ts 無変更 |
| `frontend/src/declarative.ts:60` | 型不正確 | `$ = (sel: string): HTMLElement => document.querySelector(sel) as HTMLElement` で null を握りつぶす。 `#root` 不在時に runtime error になり error message も同 helper 経由で再帰失敗する潜在的バグ。 戻り型を `HTMLElement \| null` にして call site で guard を推奨 |
| `src/auth/paseto-verify.ts:101-104` | 型ナロウ二重キャスト | `V4.verify` の戻りを `{payload?...} | Record<string, unknown>` の union から `payload in result ? ... : result` で剥がしている。 paseto lib の型が `complete: true` で明確に payload を返す形なので、 オプション付き型 narrow ヘルパに統合可能 |

その他:
- マジックナンバー: REFRESH_INTERVAL_MS = 6h (paseto-verify.ts:20) と key length 32 (paseto-verify.ts:73) はインラインだが用途明確
- 新規 corpus.ts (206 行) は型定義中心、 STATUS_OPTIONS / PRIORITY_OPTIONS の単一情報源化を実現
- vendor copy 1030 LOC (corpus-renderer/renderer.ts) は本リポでの保守対象外だがメンテ責務の所在は明文化済 (renderer.ts:1-4)
- TypeScript strict mode 維持、 新規ファイル群で any 型増加なし

## 2. データスキーマ (B)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 正規化 | Task / PM project / Task snapshot 分離、 task_snapshots で task_id 複製 (denormalize)。 本周期は schema 変更なし |
| B | Legacy column | 個人情報 (name/email/password_hash) は DROP 禁止規則で残存。 マイグレーション戦略未文書化 (前回継続) |
| A | FK 無関連性 | user_id は FK、 group_id 等の親子は constraint。 PASETO payload.sub → users.id への FK 関係は session-cache が暗黙的に維持 |
| B | Index | task.created_by, task.group_id 等の index 明示文書なし (spec/dbs/*.md 参照推奨) |

新規 `src/corpus.ts` の `data` 配列 (corpus.ts:192-195) は API パスの宣言で DB schema には影響しない。 declarative panel の field 定義 (corpus.ts:127-171) は API 側の Task model と人手同期されている → 将来 zod/JSON Schema からの自動生成が望ましい (重複源 = drift リスク)。

**指摘**: corpus.ts の `STATUS_OPTIONS` / `PRIORITY_OPTIONS` (corpus.ts:101-113) と backend の Task model enum を `src/shared/task-enums.ts` 等で単一情報源化推奨。

## 3. SRE (B)

| 評価 | 観点 | 所見 |
|------|------|------|
| A | ログ | 構造化 JSON、 requestId 追跡可能 (src/app.ts:67-90)。 PASETO 経路は `[paseto] verify enabled / public keys refreshed / refresh failed` を console に出す (paseto-verify.ts:59,80,83) — タグ統一済 |
| B | デプロイ | Docker Compose 管理、 CI は test.yml のみ、 デプロイ自動化未整備 |
| A | 障害対応 | `/api/health/live` (liveness, src/app.ts:257-263) + `/api/ready` (readiness, src/app.ts:268-313) + 後方互換 `/api/health` (src/app.ts:313) を提供。 readiness は DB / Redis を実 ping して 503 を返す実装で k8s 直接接続可能 |
| A | セキュリティパッチ | npm audit 可能、 CI 未統合 (前回継続) |

**指摘**: PASETO の `refreshPublicKeys` 失敗を console.warn のみで握りつぶしている (paseto-verify.ts:81-84)。 readiness probe の `health.paseto_status` (`fresh` / `stale_Xh` / `failed`) を追加し、 cache の最終更新時刻を露出すれば k8s ロールバックや alert 連動が可能になる。
