# 設計レビュー — Actio (2026-05-23)

## 1. 設計強度 (B)

| 評価 | 観点 | 所見 |
|------|------|------|
| B | 障害分離 | Cernere 障害時は 401。Nuntius 非応答は log warn で続行 (src/lib/task-notifications.ts:62)。Redis フェイルオーバーは未実装 (non-critical) |
| A | 冪等性 | Drizzle ORM。WebSocket module_request の破壊操作も一貫 |
| A | 入力バリデーション | 認証 middleware 経由必須。タスク作成時に title/deadline 型チェック |
| A | エラーハンドリング | グローバルハンドラ (src/app.ts:44-50) で 500 系統一、requestId 埋め込み |
| B | リトライ | WS dispatcher にタイムアウト (src/ws/dispatcher.ts:30) あるが、HTTP route の retry policy 未明文化 |
| A | 状態管理 | Task status enum を CLAUDE.md に明記、Corpus 宣言 (src/corpus.ts) で静的定義 |

## 2. 設計思想の一貫性 (B)

| 該当箇所 | 逸脱内容 | 推奨修正 |
|----------|---------|---------|
| `src/app.ts:12-13` | 予定系コードの「削除済み」コメントと、modules/* に残る予定系 import の整合性確認漏れ可能性 | 静的解析で modules/ から event/calendar/placement import の grep |
| `frontend/src/pages/` (Dashboard) | calendar 中心の UI のまま | Dashboard の Task focus 再設計 (split-task-only-phase-2) |

## 3. モジュール分割度 (A)

| モジュール | 凝集度 | 所見 |
|-----------|--------|------|
| `modules/task/` | 機能的 | タスク CRUD + 状態遷移、task-plugins.ts で拡張可能 |
| `src/plugins/` | 機能的 | defineModule の install/registry/context が分離、責務明確 |
| `src/auth/` | 機能的 | Cernere SSO の abstraction + session cache 分離、user-info.ts が単一情報源 |
| `modules/pm/` | 機能的 | GitHub/Notion sync / conflict resolution / analytics が cohesive |
| `src/ws/` | 通信的 | dispatcher + commands 分離だが module_request routing と command dispatch の責務が混在 |
| `frontend/src/pages/` | 逐次的 (weak) | Dashboard が calendar/task/event 混在、split-task-only-phase-2 で再設計予定 |

`src/db/repository.ts` は 2391 行と大きい — entity 別に分割の余地あり (REVIEW_IMPLEMENTATION 参照)。
