# REVIEW_MISSING_FEATURES — Actio

**評価: B**

## Core Task: 95% (ほぼ完成)

| 機能 | 実装 | 根拠 |
|------|------|------|
| CRUD | 完成 | routes.ts:94-292 |
| Status state machine | 完成 | completedAt auto-set (routes.ts:197-201) |
| Assignment & owner check | 完成 | routes.ts:175-176, 284 |
| Deadline & estimated time | 完成 | deadline param, estimatedMinutes |
| Plugin system | 完成 | registerTaskPlugin() |
| Push notifications | 70% | notify* defined (routes.ts:24-27) だが Nuntius 統合不明 |

## PM (Project Management): 70% (計画完成、コード未確認)

GitHub/Notion 同期・差分検知・コンフリクト解決・タスク検証・クリティカルパス・ゴンペルツ曲線・Webhook・リマインダーはいずれも PLAN.md 詳細だが、sync/ analytics/ reminder/ の実装は未確認 (要 handoff 確認)。

## その他完成度

| 領域 | スコア |
|------|--------|
| Group management | 90% |
| WebPush (PWA) | 80% (#122) |
| Settings / profile | 85% |
| Machina (chat-to-task) | 0% (Discutere へ移行済) |
| Module SDK integration | 85% |

**総合: B**。Core は完成度高いが PM モジュール実装の確認・補完が残課題。
