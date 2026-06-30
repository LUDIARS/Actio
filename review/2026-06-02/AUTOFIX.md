# AUTOFIX.md — Actio (2026-06-02)

## 概要
- 修正ファイル数: 0
- 変更行数: +0 / -0
- カテゴリ別件数: lint=0 / typo=0 / unused_import=0 / dead_code=0 / gitignore=0 / toc=0 / critical_high=0
- 関連 PR: なし
- 備考: 本日の自動修正対象は 0 件。候補はいずれも実コード確認 (PM モジュール実装状況) または設計判断を要するため手作業に回した。

## カテゴリ別
本日該当なし (lint / typo / 未使用 import / dead code / .gitignore / TOC / critical_high すべて 0)。

## フラグしたが手作業に回した指摘
- `package.json:66` — `bcryptjs@^3.0.3` は v3 beta。stable (`^2.4.3` 等) への変更は依存挙動確認を要するため手作業。
- `src/app.ts` — CSP `style-src 'unsafe-inline'` の硬化は inline style 分離 (frontend) を伴う大型作業。
- `scripts/ci-check.sh` — `npm audit` 追加は CI 失敗閾値の方針判断を要する。
- `modules/pm/{sync,analytics,reminder}/` — 実装確認・補完 (大型)。
- `frontend/src/pages/` — split-task-only 後の Dashboard UI 再設計。

## 関連
- レビュー全文: REVIEW.md / REVIEW_*.md
