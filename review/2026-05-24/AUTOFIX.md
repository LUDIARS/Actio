# AUTOFIX — Actio (2026-05-24)

## 概要

- 修正ファイル数: 0
- 変更行数: +0 / -0
- カテゴリ別件数: lint=0 / typo=0 / unused_import=0 / dead_code=0 / gitignore=0 / toc=0 / critical_high=0
- 関連 PR: なし

**修正対象なし (自動 commit 対象)**: 本周期 (4 commits, +1700 LOC ほぼ追加) で機械的に安全な lint / typo / unused_import 系の指摘は検出されなかった。 下記は全て手作業に回した。

## カテゴリ別

該当なし。

## フラグしたが手作業に回した指摘 (= 自動修正の範囲外)

### Mechanical (1 行 textContent 化、 critical_high には未昇格)
- `frontend/src/declarative.ts:151` — `innerHTML` でのエラー文字列補間。 error path 限定の Medium XSS リスク (REVIEW_VULNERABILITY §1)。 修正自体は 2 行で済むが、 共通 helper 切り出し + error UI の整理を伴うため bounded change として扱い AUTOFIX には含めず

### Critical/High bounded (手作業推奨、 単独で完結する 1 PR 規模)
- `src/auth/paseto-verify.ts` の unit テスト追加 (5 ケース) — REVIEW_QUALITY §1 D-2
- `src/middleware/auth.ts` の 2 段検証 integration テスト — REVIEW_QUALITY §1
- `frontend/src/declarative.ts:60` の `$` helper を `HTMLElement | null` 化 + call site guard — REVIEW_IMPLEMENTATION §1
- `scripts/check-corpus-vendor-drift.sh` 新規 + test.yml に step 追加 — REVIEW_MISSING_FEATURES §2

### Handed to human (large refactor / 設計判断)
- `frontend/src/pages/` の Calendar/Events 系 dead code 整理 (split-task-only-phase-2) — REVIEW_MISSING_FEATURES §1
- Dashboard を Task-focused に再設計 — REVIEW_MISSING_FEATURES §1
- `.github/workflows/test.yml` への npm audit step 追加 (他 LUDIARS リポと整合性必要) — REVIEW_MISSING_FEATURES §2
- `src/db/repository.ts` (2391 行) を entity 別に分割 — REVIEW_IMPLEMENTATION §1
- `THIRD_PARTY_LICENSES.md` の npm license-checker 自動化と内容決定 — REVIEW_QUALITY §2
- `/api/admin/auth/paseto-status` endpoint の route 設計 + 認証要否決定 — REVIEW_MISSING_FEATURES §2
- main.tsx 側 TaskPage を declarative panel に置き換えるロードマップ (Corpus DESIGN.md §13.8 step 4 後半) — REVIEW_DESIGN §2

## 関連

- レビュー全文: REVIEW.md / REVIEW_*.md
- 前回レビュー: review/2026-05-23/REVIEW.md
