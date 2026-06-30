# AI Code Review Format — Web サービス (Actio)

| 項目 | 値 |
|------|-----|
| リポジトリ | LUDIARS/Actio |
| 対象ブランチ / PR | feat/split-task-only |
| レビュー実施日 | 2026-05-20 |
| 対象コミット範囲 | 15261cd (2026-05-20) .. 8b2dfcb (2026-05-20) |

---

## 総合評価（全 17 項目）

| # | レビュー観点 | 評価 | 重大指摘数 | ドキュメント |
|---|------------|------|-----------|------------|
| 1 | 設計強度 | B | 1 | REVIEW_DESIGN.md |
| 2 | 設計思想の一貫性 | A | 0 | REVIEW_DESIGN.md |
| 3 | モジュール分割度 | A | 0 | REVIEW_DESIGN.md |
| 4 | コード品質 | B | 0 | REVIEW_IMPLEMENTATION.md |
| 5 | コードレベル脆弱性 | B | 0 | REVIEW_VULNERABILITY.md |
| 6 | テスト戦略・カバレッジ | A | 0 | REVIEW_QUALITY.md |
| 7 | ライセンス遵守 | A | 0 | REVIEW_QUALITY.md |
| 8 | ドキュメント完備性 | B | 0 | REVIEW_QUALITY.md |
| 9 | 機能改善 | - | 2 | REVIEW_MISSING_FEATURES.md |
| 10 | 不足機能 | - | 2 | REVIEW_MISSING_FEATURES.md |
| 11 | Web 脆弱性 | B | 1 | REVIEW_VULNERABILITY.md |
| 12 | ゼロトラスト | B | 0 | REVIEW_VULNERABILITY.md |
| 13 | セキュリティ強度 | B | 1 | REVIEW_VULNERABILITY.md |
| 14 | データスキーマ | B | 1 | REVIEW_IMPLEMENTATION.md |
| 15 | SRE | B | 0 | REVIEW_IMPLEMENTATION.md |
| 16 | パフォーマンス・ベンチマーク | B | 0 | REVIEW_QUALITY.md |
| 17 | クロスプラットフォーム互換 | B | 0 | REVIEW_QUALITY.md |

**評価基準:**
- **A**: 問題なし。ベストプラクティスに準拠
- **B**: 軽微な改善点あり。運用上の影響は低い
- **C**: 改善が必要。リリース前の対応を推奨
- **D**: 重大な問題あり。即時対応が必要

---

## 総合サマリ

Actio は LUDIARS のプラグインベース「予定 & タスク管理プラットフォーム」であり、本レビュー対象である feat/split-task-only ブランチでは**サービスをタスク管理専用に絞り込む方針転換**（CLAUDE.md で明文化）が実施されている。このブランチは以下の 4 コミット (2026-05-20) で構成：

1. `15261cd`: 方針転換を CLAUDE.md に明文化
2. `9285e62`: バックエンド — 予定系コードを削除 (event / calendar / placement / reservation 等)
3. `52647e3`: フロントエンド — 予定系ページ・スクリプトを削除
4. `8b2dfcb`: scripts/ 誤削除の復元

**強み：**
- **設計・品質**: 方針転換後も設計思想・モジュール分割が堅牢。タスク系コア (modules/task + PM) は入力バリデーション・アクセス制御が適切。
- **テスト**: unit/integration テスト全て通過。削除コミットでテストも対応削除し整合性維持。
- **認証・認可**: Cernere 連携で個人データ Actio 非保管化を達成。JWT 検証 + role-based アクセス制御実装。
- **セキュリティ**: レート制限・セキュリティヘッダ実装。

**改善点：**
- **IDOR 潜在リスク**: GET /api/tasks/:id は認証のみで所有権チェックなし（DELETE 時は厳格）
- **コンフィグ情報露出**: index.ts で FRONTEND_URL / GOOGLE_REDIRECT_URI を起動ログ出力
- **データスキーマ**: 旧個人データカラム (users.name/email/role/passwordHash 等) は DROP COLUMN 禁止ルールに従い残置。新規コード不使用の約束だが段階的 migration roadmap 化が望ましい
- **ドキュメント乖離**: README は split-task-only 前の全体像。タスク専用化を反映する更新が必要

**重み付けスコア: A-** (17 採点項目中 A 3 / B 11 / C 0 / D 0 + 機能 2 項目。削除・再統合による大型リファクタリングの成熟度は高い)
