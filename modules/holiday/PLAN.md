# 休日管理モジュール計画書

## 概要

日本の祝日の自動計算・DB 同期と、グループ固有の休日・休業期間・審査会期間の管理を提供するモジュール。スケジュール配置時の休日考慮ユーティリティも含む。

---

## モジュール構成

```
modules/holiday/
├── PLAN.md                     # 本設計書
├── routes.ts                   # 休日 API ルート
├── japanese-holidays.ts        # 日本の祝日ルールベース計算
└── utils.ts                    # スケジュール配置用ユーティリティ
```

---

## 1. 主要機能

### 1.1 日本の祝日自動計算

ルールベースで日本の祝日を計算 (春分・秋分の日含む)。外部 API 不要。

### 1.2 DB 同期

計算した祝日を一括で holidays テーブルに登録。ソース識別子 (例: `japanese_holidays_2026`) で管理。

### 1.3 グループ固有休日

グループ単位で独自の休日・休業期間を設定可能。`groupId` でスコープ。

### 1.4 ユーティリティ (utils.ts)

- `getBlockedDates(groupId, range)` — 休日・休業日の一覧取得
- `getClassDays(groupId, range)` — 授業可能日の一覧取得
- `isNonBusinessDay(date, groupId)` — 営業日判定
- `SchedulingOptions` — スケジューラ向けオプション型

---

## 2. API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/japanese/:year` | 指定年の日本の祝日一覧 (計算のみ) |
| POST | `/japanese/sync` | 祝日を DB に一括同期 |
| GET | `/` | 休日一覧 (groupId/dateRange フィルタ可) |
| POST | `/` | 休日登録 |
| DELETE | `/:id` | 休日削除 |

---

## 3. 依存モジュール

| モジュール | 用途 |
|-----------|------|
| group | グループメンバーのバリデーション |

**被依存 (このモジュールに依存する他モジュール):**

| モジュール | 用途 |
|-----------|------|
| smart-scheduler | 休日を考慮した自動配置 |
| schedule (CALICULA) | 休日を考慮したカリキュラム配置 |

---

## 4. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| GroupsPage | `/groups` | グループ個別予定 (休日設定) |
| SmartSchedulerPage | `/scheduler` | 休日オプション |
