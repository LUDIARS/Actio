# 自動配置スケジューラモジュール計画書

## 概要

バックトラッキング + メモ化 DP によるスケジュール自動配置エンジン。グループメンバーの空き状況、講師制約、優先度を考慮し、最適なスケジュールを自動生成する。

---

## モジュール構成

```
modules/smart-scheduler/
├── PLAN.md                     # 本設計書
├── routes.ts                   # スケジューラ API ルート
├── solver.ts                   # DP 最適化ソルバー
└── availability.ts             # メンバー空き状況計算
```

---

## 1. アルゴリズム

### 1.1 入力

```typescript
TaskInput {
  id: string;
  title: string;
  duration: number;          // 必要コマ数
  priority: number;          // 優先度 (高い=先に配置)
  preferredDays: number[];   // 希望曜日
  preferredPeriods: number[];// 希望時限
  instructorId?: string;     // 講師制約
}
```

### 1.2 ソルバー

- **バックトラッキング**: タスクを優先度順にスロットへ配置を試行
- **メモ化DP**: 同一状態の再計算を回避
- **スロットスコア**: `(空きメンバー数 × 10) + 希望ボーナス`
- **出力**: `Placement[]` + `totalScore` + `unplacedTaskIds[]`

### 1.3 制約

- 7 日間 × 11 コマ = 77 スロット
- 講師の出講可能スロット
- 休日・休業期間 (holiday モジュール連携)
- 既存予定との重複回避

---

## 2. API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/solve` | 自動配置実行 |
| GET | `/availability/:groupId` | グループ空き状況 |
| POST | `/tasks` | スケジューリングタスク登録 |
| GET | `/tasks` | タスク一覧 |
| POST | `/apply` | 配置結果を確定適用 |

---

## 3. 空き状況計算

グループメンバー全員の以下を集約:
- personalEvent (手動予定)
- groupSchedules (グループ予定)
- カリキュラム配置 (CALICULA 連携時)

各スロットに `availableCount / totalMembers` を算出。

---

## 4. 依存モジュール

| モジュール | 用途 |
|-----------|------|
| holiday | getBlockedDates, getClassDays, SchedulingOptions |
| group | メンバー・予定の取得 |
| calendar | personalEvent の取得 |

---

## 5. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| SmartSchedulerPage | `/scheduler` | 自動配置 UI |
