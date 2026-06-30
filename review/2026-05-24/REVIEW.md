# AI Code Review — LUDIARS/Actio

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | main |
| レビュー実施日 | 2026-05-24 |
| 対象コミット範囲 | 8251c02..c959421 (4 commits since 2026-05-23) |
| 前回レビュー | 2026-05-23 (review/2026-05-23/REVIEW.md) |

## 総合評価

| # | レビュー観点 | 区分 | 評価 | 重大指摘数 | ドキュメント |
|---|------------|------|------|-----------|------------|
| 1 | 設計強度 | 共通 | B | 0 | REVIEW_DESIGN.md |
| 2 | 設計思想の一貫性 | 共通 | B | 2 | REVIEW_DESIGN.md |
| 3 | モジュール分割度 | 共通 | A | 0 | REVIEW_DESIGN.md |
| 4 | コード品質 | 共通 | B | 1 | REVIEW_IMPLEMENTATION.md |
| 5 | コードレベル脆弱性 | 共通 | B | 1 | REVIEW_VULNERABILITY.md |
| 6 | テスト戦略 | 共通 | C | 3 | REVIEW_QUALITY.md |
| 7 | ライセンス遵守 | 共通 | A | 0 | REVIEW_QUALITY.md |
| 8 | ドキュメント完備性 | 共通 | B | 1 | REVIEW_QUALITY.md |
| 9 | 機能改善 | 共通 | - | - | REVIEW_MISSING_FEATURES.md |
| 10 | 不足機能 | 共通 | - | 4 | REVIEW_MISSING_FEATURES.md |
| 11 | Web 脆弱性 | Web | A | 0 | REVIEW_VULNERABILITY.md |
| 12 | ゼロトラスト | Web | B | 1 | REVIEW_VULNERABILITY.md |
| 13 | セキュリティ強度 | Web | A | 0 | REVIEW_VULNERABILITY.md |
| 14 | データスキーマ | Web | B | 2 | REVIEW_IMPLEMENTATION.md |
| 15 | SRE | Web | B | 1 | REVIEW_IMPLEMENTATION.md |
| 16 | パフォーマンス | Web | B | 0 | REVIEW_QUALITY.md |
| 17 | クロスプラットフォーム | Web | B | 0 | REVIEW_QUALITY.md |

加重スコア (A=4 / B=3 / C=2 / D=1, axis 1-8 + 11-17 の 14 軸平均): **3.43 / 4.00**

## 概要

本周期 (4 commits, +1700 LOC ほぼ追加のみ) の主軸は **Hub (Corpus) との宣言的統合の完成** である:

1. `596e52d` — Actio に `src/corpus.ts` (CorpusServiceManifest + taskPanel descriptor) を実装し `/.well-known/corpus-service.json` を公開
2. `a619364` — Cernere PASETO V4 (Ed25519) トークン受理を `src/auth/paseto-verify.ts` に新規追加、`src/middleware/auth.ts` を 2 段検証 (PASETO → HS256) に拡張
3. `a16ed13` — Vite multi-entry で `frontend/declarative.html` + `src/declarative.ts` を別エントリ追加し、 vendor copy された corpus-renderer (1030 LOC) で descriptor を独自描画
4. `c959421` — `npm run env:gen` alias を package.json に追加し他 LUDIARS サービスと canonical 命名統一

設計・モジュール分割・ライセンス・Web 脆弱性は前回 (2026-05-23) と同等の水準を維持。新規指摘は以下:

- **新規 D-1 (脆弱性 B → 軽微):** `frontend/src/declarative.ts:151` でエラー文字列を `innerHTML` 補間。 error path 限定だが XSS 余地あり (textContent 化で 1 行修正可能、AUTOFIX 候補)
- **新規 D-2 (テスト C → 維持):** PASETO V4 verify + JWT fallback 2 段検証フローと kid-iteration cache に対応する単体テストが 0 件 (security-critical の追加機能)
- **新規 D-3 (vendor copy 管理):** `frontend/src/corpus-renderer/{renderer,types}.ts` (vendor copy 1030 LOC) の編集禁止コメントは付いているが、 原本 (LUDIARS/Corpus) との drift 検知ジョブ未整備

前回からの継続課題 (Calendar/Events 残存 dead-code、Dashboard 再設計、repository.ts 2391 行) は本周期で変化なし。
