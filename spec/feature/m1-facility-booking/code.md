# M1: 施設予約 コード構成

## ファイル一覧

| ファイル | 役割 |
|---------|------|
| `modules/school/facility-booking/routes.ts` | 教室・会議室の予約 API ルート。カレンダー自動連携付き |
| `modules/school/facility-booking/index.ts` | 予約プラグインとしての登録処理 |
| `src/reservation-plugins.ts` | 予約プラグインレジストリ。プラグインの登録・取得を管理 |

## 依存関係

- `src/db/repository.ts` — `roomRepo`, `personalEventRepo` を使用
- `src/db/schema.ts` — `reservations`, `rooms`, `personalEvents` テーブル定義

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | /api/school/m1/facility-booking/reservations | 予約一覧 |
| POST | /api/school/m1/facility-booking/reservations | 予約作成 |
| DELETE | /api/school/m1/facility-booking/reservations/:id | 予約キャンセル |
| GET | /api/school/m1/facility-booking/availability | 空き状況照会 |
| GET | /api/reservations/plugins | 登録済みプラグイン一覧 |

## フロントエンド対応

| ページ | ファイル |
|--------|---------|
| 予約ランチャー | `frontend/src/pages/ReservationsPage.tsx` |
| 施設予約 | `frontend/src/pages/FacilityBookingPage.tsx` |
