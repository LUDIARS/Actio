# 不足機能評価 — Actio (2026-05-24)

## 1. 機能改善提案

| 対象機能 | 改善提案 | 期待効果 | 優先度 |
|---------|---------|---------|--------|
| Task 一覧 (declarative panel) | 優先度/ステータスでのフィルター UI を corpus.ts の `taskPanel` に追加 (corpus-renderer の `filter` component で descriptive 可能) | Corpus hub からのタスク検索効率向上 | High |
| Task notification | タスク更新時の Nuntius push (完了/期限切れ/assign) は既実装、 declarative panel 経由の操作 (PUT/DELETE) からも 同じ trigger を発火させる integration test 追加 | task awareness 向上 + UI 経路の二重化への対応 | High |
| Dashboard | calendar 中心 → task 中心へ再設計 (split-task-only-phase-2、 前回継続)。 main.tsx の TaskPage を declarative panel に置き換えるロードマップ確定 | UI coherence + 自前 SPA 撤去 (Corpus DESIGN.md §13.8 step 4 後半) | High |
| PASETO key cache 可視化 | `/api/admin/auth/paseto-status` で cache size / 最終 refresh 時刻 / 各 kid の fetchedAt を露出 | 運用時の障害切り分け短縮 (現状は console.warn のみ) | Medium |
| Group rate limit | group 単位 API quota、 PASETO 経路にも適用 (project-key 由来でテナント識別可能) | マルチ tenant のリソース割当制御 + DoS 緩和 | Medium |
| Task 依存/blocking | task A が task B を block (Notion/GitHub Issues 類似) | プロジェクト管理 criticality 向上 | Medium |

## 2. 不足機能提案

| 提案機能 | 必要性 | 優先度 | 影響範囲 |
|---------|--------|--------|---------|
| npm audit / SAST CI 統合 | CVE 自動検知 (新規 paseto@3.1.4 を含む全依存) | High | .github/workflows/test.yml |
| corpus-renderer vendor drift 検知 | LUDIARS/Corpus の renderer.ts と Actio frontend/src/corpus-renderer/renderer.ts の SHA 比較 → drift で CI fail | High | scripts/check-corpus-vendor-drift.sh + test.yml |
| PASETO unit test | security-critical な新規コードのカバレッジ確保 (REVIEW_QUALITY §1) | High | tests/auth/paseto-verify.test.ts |
| `/api/admin/auth/paseto-status` endpoint | Cernere 公開鍵 cache の運用可視化 (上表参照) | Medium | src/admin/ + 該当 route |
| TypeScript strict 強化 (`HTMLElement` null 握り潰しの解消) | declarative.ts:60 の `as HTMLElement` を `\| null` 化、 call site の guard 整備 | Medium | frontend/src/declarative.ts |
| Calendar/Events page dead code 整理 | split-task-only-phase-2 (前回継続) | Medium | frontend/src/pages/ |
