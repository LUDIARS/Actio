# REVIEW_DESIGN — Actio

**評価: A**

| 項目 | 評価 | 根拠 |
|------|------|------|
| モジュール分離 | A | Task (core) / PM (plugin) / Group (shared) の責務明確 |
| プラグインシステム | A | SDK 統合により modules/ を uniform に拡張可能 (CLAUDE.md defineModule()) |
| データモデル | A | Task (deadline + requirements) / Event 概念の棲み分け明確 (PLAN.md §1) |
| 認証設計 | A | Cernere 単一情報源, JWT/PASETO V4 + cache, fail-closed/open 選択可 (user-info.ts:98-111) |
| 階層化 | A | handler → repository → DB の strict 分離。SQLite 固有メソッド禁止 |
| リポジトリパターン | A | repository.ts で ORM 汎用化、完全型安全 |

## 設計懸念

| 項目 | 懸念 |
|------|------|
| split-task-only 後の Dashboard | カレンダー中心のまま (spec/features.md:51) → Schedula 完了後に再設計予定 |
| PM コンフリクト解決 | conflict-resolver.ts 計画文書のみ、実装詳細不明 (PLAN.md:19 claude-code 連携予定) |
| module_state スコープ | global/group/user の仕様明確、admin API で制御 |

設計アンチパターンは検出されず。**A**。
