# 設計レビュー — Actio (2026-05-24)

## 1. 設計強度 (B)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 障害分離 | Cernere `/.well-known/cernere-public-key` 取得失敗時 `src/auth/paseto-verify.ts:81-84` は warn + cache 継続使用で graceful。 起動時 fetch も `void` で非同期、 boot ブロックしない設計 |
| A | 冪等性 | `installModule` / repo 経由 CRUD は Drizzle ORM 単一抽象、 PASETO verify は副作用なし |
| A | 入力バリデーション | `verifyPasetoToken` は `v4.public.` prefix チェック + `payload.kind === "user_for_project"` + `payload.sub` 文字列確認 (paseto-verify.ts:95-107) で多段検証 |
| A | エラーハンドリング | グローバルハンドラ (src/app.ts:44-51) で 500 系統一、 `requestId` 埋め込みは継続。 新規 PASETO 経路の例外は `try/catch` で next kid に進む (paseto-verify.ts:117-119) |
| B | リトライ | PASETO 公開鍵 refresh は 6h 固定 interval (paseto-verify.ts:20)、 一時失敗時の exponential backoff なし。 cache が空のまま 6h スタックする最悪ケースは未対策 |
| A | 状態管理 | Task status enum は CLAUDE.md + `src/corpus.ts:101-107` の `STATUS_OPTIONS` で静的に一元定義。 priority も同様に `PRIORITY_OPTIONS` (corpus.ts:109-113) |

## 2. 設計思想の一貫性 (B)

| 該当箇所 | 逸脱内容 | 推奨修正 |
|----------|---------|---------|
| `src/app.ts:12-13` `:147-148` `:172-174` `:191-192` | 「Schedula に分離」コメントが 4 箇所に散在、 frontend/src/pages/ に Calendar/Events 系ページが残存。 split-task-only Phase 2 が未完 | `frontend/src/pages/` の Calendar/Events 系を削除し、 React Router route も併せて整理 (Dashboard 再設計の前段) |
| `frontend/src/declarative.ts` vs `frontend/src/App.tsx` | 同じ task UI を「declarative panel (β)」と「既存 React SPA」で二重保持。 Corpus DESIGN.md §13.8 step 4 後半 (自前 SPA 撤去) はまだ未着手 | declarative.html の β が安定したら main.tsx 側の TaskPage を撤去するロードマップを spec/features.md に追記 |
| `frontend/src/corpus-renderer/renderer.ts` | 1030 LOC の vendor copy。 編集禁止コメント (renderer.ts:1-4) はあるが、 上流 (LUDIARS/Corpus) との drift 検知が cron 化されていない | CI に `scripts/check-corpus-vendor-drift.sh` を追加し SHA 比較で diff を検出 |

## 3. モジュール分割度 (A)

| モジュール | 凝集度 | 所見 |
|-----------|--------|------|
| `modules/task/` | 機能的 | タスク CRUD + 状態遷移、 task-plugins.ts で拡張点を明示 |
| `src/auth/paseto-verify.ts` | 機能的 | 87 LOC の自己完結モジュール。 公開鍵 cache + verify を 1 単位に閉じ、 middleware/auth.ts 側は `verifyPasetoToken(token)` だけ呼ぶ |
| `src/middleware/auth.ts` | 機能的 | 2 段検証 (PASETO → HS256 → dev header → anonymous) の優先順位が明確。 各経路の session_cache 経由 setter が共通化されている |
| `src/corpus.ts` | 機能的 | サービスマニフェスト + UI descriptor の 1 ファイル定義。 STATUS_OPTIONS / PRIORITY_OPTIONS が同居 (=enum の単一情報源化) |
| `frontend/src/corpus-renderer/` | 共有 (vendor) | Corpus 上流からの copy。 サービス側の declarative.ts は薄い bootstrap (155 LOC) に留まる |
| `frontend/src/declarative.ts` | 通信的 | `makeDataFn(manifest)` で dataId → path 解決 + cookie credentials 付き fetch を一手に。 main.tsx (既存 React) とは静的に分離 (vite multi-entry) |

新規追加コードは平均 100-200 LOC の小モジュールに分割されており、 `src/db/repository.ts` (2391 行) の肥大化が相対的にますます目立つ状況。 entity 別の分割を別途継続課題として保持する。
