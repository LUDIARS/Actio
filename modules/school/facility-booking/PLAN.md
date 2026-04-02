# 施設予約サブモジュール計画書 (CALICULA サブモジュール)

## 概要

教室・会議室の予約管理サブモジュール。CALICULA (M1) のサブモジュールとして動作し、予約作成時にカレンダー予定 (personalEvent) を即時登録、キャンセル時に連動削除する。予約プラグインシステムにも対応。

---

## モジュール構成

```
modules/school/facility-booking/
├── PLAN.md                     # 本設計書
├── routes.ts                   # 予約 API ルート
└── index.ts                    # プラグイン登録
```

---

## 1. データモデル

### 1.1 予約 (Reservation)

| フィールド | 型 | 説明 |
|-----------|-----|------|
| id | string | 主キー |
| title | string | 予約名 |
| roomId | string | 教室ID |
| groupId | string? | グループID |
| day | number | 曜日 (0-6) |
| period | number | 時限 (0-10) |
| createdBy | string | 作成者 |
| participants | string[] | 参加者一覧 |
| status | string | confirmed / cancelled / pending |
| note | string | 備考 |

---

## 2. API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/reservations` | 予約作成 (カレンダー自動登録) |
| GET | `/reservations` | 予約一覧 (フィルタリング可) |
| GET | `/reservations/:id` | 予約詳細 |
| PUT | `/reservations/:id` | 予約更新 |
| DELETE | `/reservations/:id` | 予約キャンセル (カレンダー連動削除) |
| GET | `/rooms/availability` | 教室空き状況確認 |
| GET | `/rooms/:roomId/schedule` | 教室別スケジュール |

---

## 3. 主要フロー

### 3.1 予約作成フロー

```
[ユーザ: 予約リクエスト]
    │
    ▼
┌──────────────────────┐
│  コンフリクト検出      │  同時間帯の既存予約 & 授業スケジュールをチェック
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  参加者展開            │  groupId → グループメンバー一覧を取得
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  personalEvent 作成    │  各参加者のカレンダーに予定を自動登録
└──────────┬───────────┘
           ▼
┌──────────────────────┐
│  通知送信              │  reservation.created イベント発火
└──────────────────────┘
```

### 3.2 予約キャンセルフロー

予約をキャンセルすると、関連する personalEvent も連動して削除される。

---

## 4. 予約プラグインシステム

`ReservationPlugin` インターフェースに準拠し、`GET /api/reservations/plugins` から登録済みプラグインとして公開される。

---

## 5. 依存モジュール

| モジュール | 用途 |
|-----------|------|
| calendar | personalEvent の作成・削除 |
| notification | 予約イベントの通知 |
| group | グループメンバーの展開 |
| schedule | 授業スケジュールとの競合チェック |

---

## 6. フロントエンド対応

| ページ | パス | 説明 |
|--------|------|------|
| ReservationsPage | `/reservations` | プラグインランチャー |
| FacilityBookingPage | `/facility-booking` | 施設予約 UI |
