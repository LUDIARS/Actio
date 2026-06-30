# AUTOFIX — Actio (2026-05-23)

## 概要

- 修正ファイル数: 0
- 変更行数: +0 / -0
- カテゴリ別件数: lint=0 / typo=0 / unused_import=0 / dead_code=0 / gitignore=0 / toc=0 / critical_high=0
- 関連 PR: なし

**修正対象なし**: 本周期 (2 commits) は Corpus declarative panel 統合のみで、機械的修正可能な指摘は検出されなかった。下記候補は全て手作業に回した。

## カテゴリ別

該当なし。

## フラグしたが手作業に回した指摘 (= 自動修正の範囲外)

- `frontend/src/pages/` — Calendar/Event 関連 dead code (split-task-only-phase-2 で UI 再設計が必要、bounded fix にできない) — REVIEW_MISSING_FEATURES.md §1
- `Dashboard` — Task-focused 再設計 (large refactor) — REVIEW_MISSING_FEATURES.md §1
- `.github/workflows/test.yml` — npm audit step 追加 (CI 設計者と要相談、Actio 単独追加は他リポと整合性影響あり) — REVIEW_QUALITY.md §1
- `src/app.ts` — `/.well-known/health` endpoint 追加 (route 設計と認証要否を要決定) — REVIEW_MISSING_FEATURES.md §2
- `src/db/repository.ts` — 2391 行を entity 別に分割 (large refactor) — REVIEW_IMPLEMENTATION.md §1
- `THIRD_PARTY_LICENSES.md` — npm license-checker 自動化と内容決定要 — REVIEW_QUALITY.md §2
- `plugin isolation` — src/plugins/context.ts の API 露出再検討 (設計判断) — REVIEW_VULNERABILITY.md §3

## 関連

- レビュー全文: REVIEW.md / REVIEW_*.md
