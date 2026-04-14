# Event Module — 予定 (Core)

Schedula のコアモジュール。「予定」= 時間拘束のある未来の事象。

## 概念

「予定 (Event)」は以下を満たす:
- **未来の事象**: これから発生する
- **要件を持たない**: 「何かを達成する」ではなく「時間枠を確保する」
- **時間拘束がある**: `startTime` / `endTime` が確定している
- 例: ミーティング、講義、予約、イベント

→ タスクとは違い、**固定的に発生する時間拘束**を表す。

## API

ベースパス: `/api/events`

| メソッド | パス | 説明 |
|--------|------|------|
| GET    | `/api/events` | 一覧取得 (filter: scope, groupId, from, to, pluginId) |
| GET    | `/api/events/:id` | 詳細取得 |
| POST   | `/api/events` | 作成 |
| PUT    | `/api/events/:id` | 更新 (owner のみ) |
| DELETE | `/api/events/:id` | 削除 (owner のみ) |
| GET    | `/api/events/plugins` | 登録済み Event プラグイン一覧 |

### scope クエリパラメータ

- `owned` (default): 自分が作成した予定
- `group`: `groupId` 必須。指定グループの予定

## DB スキーマ

`events` テーブル:

| カラム | 型 | 説明 |
|------|---|------|
| id | TEXT PK | 予定ID |
| owner_id | TEXT NOT NULL | 作成者ユーザID |
| group_id | TEXT | グループID (個人予定は null) |
| title | TEXT NOT NULL | タイトル |
| description | TEXT | 説明 |
| start_time | TIMESTAMP NOT NULL | 開始時刻 (UTC) |
| end_time | TIMESTAMP NOT NULL | 終了時刻 (UTC) |
| is_all_day | BOOLEAN | 終日予定か |
| location | TEXT | 場所 |
| visibility | TEXT | private / group / public |
| plugin_id | TEXT | 生成元プラグイン ID |
| plugin_ref | TEXT | プラグイン側参照 ID |
| plugin_payload | JSON | プラグイン固有データ |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

## プラグインシステム

`EventPlugin` インターフェース (`src/shared/types.ts`):

```typescript
interface EventPlugin {
  id: string;             // "calendar", "voting", "facility-booking" 等
  name: string;
  description: string;
  icon?: string;
  apiBasePath?: string;   // プラグイン固有 API
  frontendPath?: string;  // フロントエンドルート
  managed: "core" | "external";
}
```

- `managed: "core"`: events テーブルに直接書き込む (POST /api/events 経由 + pluginId 指定)
- `managed: "external"`: 独自テーブルを保持し、pluginRef で events と紐付け

登録は各モジュール初期化時に `registerEventPlugin()` を呼ぶ:

```typescript
import { registerEventPlugin } from "../../src/event-plugins.js";

registerEventPlugin({
  id: "calendar",
  name: "カレンダー",
  description: "Google Calendar 連携・手動予定",
  icon: "Calendar",
  apiBasePath: "/api/calendar",
  frontendPath: "/calendar",
  managed: "external",
});
```

## 既存モジュールとの関係

現行の以下モジュールは将来 Event プラグインとして再分類予定:
- `modules/calendar/` (personal_events) — managed: external
- `modules/voting/` (voting_events) — managed: external
- `modules/school/facility-booking/` — managed: external
- `modules/myplan/` — managed: external (週間ルーティーン)
- `modules/smart-scheduler/` — managed: external (自動配置結果)

※既存モジュール側の改修は別 PR で実施。
