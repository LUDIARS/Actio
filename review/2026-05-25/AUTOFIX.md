# AUTOFIX — Actio (2026-05-25)

## 概要

- 修正ファイル数: 0
- 変更行数: +0 / -0
- カテゴリ別件数: mechanical=0 / bounded=0 / hand=3
- 関連 PR: なし

**修正対象なし (自動 commit 対象)**：本周期テストファイル追加（332 行）は機械的に安全な lint / typo / unused_import 系を含まず。下記は全て手作業に回した。

---

## フラグしたが手作業に回した指摘 (= 自動修正の範囲外)

### Bounded Critical/High (単独 PR 規模で対応可能)

1. **`src/app.ts` グローバル rate-limit ルール追加** (`/api/*` 全体)
   - 前回 (2026-05-24) Medium 指摘「PASETO 無効 token 連射による CPU 消費」に対する implementation
   - 現状: setup route のみ 5/15min
   - 修正内容: Hono rate-limit middleware を `/api/*` に拡張
   - 優先度: **High** (security-critical)
   - 所要時間: ~30 min (middleware review 含む)

2. **`frontend/src/declarative.ts:151` innerHTML → textContent XSS 修正**
   - 前回指摘の Medium XSS (error path で message を template literal 補間)
   - 修正内容: textContent 化 + HTML element helper 化 (2 行)
   - 優先度: **Medium** (error path だが persistent)
   - 所要時間: ~15 min (regression test 含む)

3. **`.github/workflows/test.yml` に `npm audit` step 追加**
   - 供給チェーン risk (CVE detection)
   - 前回から持ち越しの指摘
   - 修正内容: CI に `npm audit --audit-level=moderate` step を追加
   - 優先度: **Medium** (proactive)
   - 所要時間: ~10 min

### Handed to human (大型リファクタ / 設計判断)

1. **`src/middleware/auth.ts` 拡張**: kid rotation diagnostics log
   - PASETO kid trial 失敗時に verbose log (どの kid を試したか)
   - 本番での key rotation 観測強化
   - 優先度: **Low** (observability, not blocking)

2. **Vitest coverage report 自動化**
   - `vitest run --coverage` → HTML report 生成
   - CI artifacts に保存
   - 優先度: **Low** (nice-to-have)

---

## 関連

- レビュー全文: REVIEW.md / REVIEW_*.md
- 前回レビュー: review/2026-05-24/REVIEW.md
- 対象 commit: 857bdac (test: paseto-verify)
