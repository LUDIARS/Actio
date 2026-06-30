# Actio コードレビュー — REVIEW_IMPLEMENTATION.md (2026-05-22)

## 対象情報

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ | feat/split-task-only |
| レビュー実施日 | 2026-05-22 |
| 対象コミット範囲 | latest (0436ecd) |

---

## 1. コード品質 (Code Quality)

| 該当箇所 | 問題分類 | 説明 | 推奨修正 |
|----------|---------|------|---------|
| `src/db/connection.ts:26-30` | 型安全性 | DB 方言を動的ロードするため `any` 型が必要。ESLint disable コメント付き | disable コメントで適切に抑止済み。許容範囲 |
| `modules/pm/` | 複雑度 | PM モジュールは GitHub/Notion 同期・コンフリクト解決・分析を含む大規模モジュール | analyze → conflict resolve → push の 3 層に機能分割推奨 |

### チェック項目結果

- ✅ マジックナンバー: `src/shared/constants.ts` に集約
- ✅ ネストした条件分岐: middleware/auth.ts で早期リターン使用
- ✅ デッドコード: split-task-only 時に event 系削除完了。残骸なし
- ✅ DRY 違反: リポジトリ層で共通化
- ✅ スコープ: グローバル汚染なし
- ✅ 例外握りつぶし: `catch` は console.error / logging あり
- ✅ 型変換: TypeScript noImplicitAny で保護
- ⚠️ ログ出力: structured log あるが、middleware で全 request/response を記録。詳細度管理がされていない

**評価:** B。PM モジュールの複雑度が増加中。関数分割と型の明示化を推奨。

---

## 2. Web 実装観点 (Web-Specific Implementation)

### フロントエンド品質

| 該当箇所 | 問題分類 | 説明 | 推奨修正 |
|----------|---------|------|---------|
| `frontend/src/lib/api.ts` | 構造 | API 呼び出しが pm, groups, tasks 等で複数カテゴリ。URL の一貫性は高い | 型定義ファイル分割で改善可。現状許容 |
| `frontend/src/components/UIBlockRenderer.tsx` | 複雑度 | Corpus declarative panel の実装。Block 型ごとの render ロジック分岐が増加予測 | render 戦略パターン採用推奨 (enum dispatch 等) |

### セキュリティ (Web 層)

- ✅ XSS: React 標準の自動エスケープ。dangerouslySetInnerHTML 使用なし
- ✅ CSRF: POST/PUT は WS `module_request` 経由。SameSite=Strict cookie 推奨
- ✅ 認証: localStorage token + Cernere ポップアップ / リダイレクト
- ✅ API キー: 外部 API (`modules/external-api/`) は header `X-API-Key` 検証

**評価:** B。Web 層の実装は良好。複雑度管理が今後の焦点。

---

## 総合評価

| # | レビュー観点 | 評価 | 重大指摘数 |
|---|------------|------|-----------|
| 1 | コード品質 | B | 2 |
