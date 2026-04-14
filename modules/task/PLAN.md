# Task Module — タスク (Core)

Schedula のコアモジュール。「タスク」= 解決すべき現在の事象。

## 概念

「タスク (Task)」は以下を満たす:
- **現在の事象**: 既に発生している (=解決待ち)
- **要件を持つ**: 「何かを達成する」必要がある
- **時間拘束はない**: 解決時刻は各自の自由意思
- **期限を持てる**: `deadline` で時間的縛りを与えられる
- 例: ToDo、Issue、レビュー依頼、調査タスク

→ 予定とは違い、**個々の活動を制約するが時間は柔軟**。

## API

ベースパス: `/api/tasks`

| メソッド | パス | 説明 |
|--------|------|------|
| GET    | `/api/tasks` | 一覧取得 (filter: scope, status, groupId, dueBefore, pluginId) |
| GET    | `/api/tasks/:id` | 詳細取得 |
| POST   | `/api/tasks` | 作成 |
| PUT    | `/api/tasks/:id` | 更新 (owner / assignee のみ) |
| DELETE | `/api/tasks/:id` | 削除 (owner のみ) |
| GET    | `/api/tasks/plugins` | 登録済み Task プラグイン一覧 |

### scope クエリパラメータ

- `owned` (default): 自分が作成したタスク
- `assigned`: 自分にアサインされたタスク
- `group`: `groupId` 必須

### status / priority

- `status`: `open` / `in_progress` / `blocked` / `done` / `cancelled`
- `priority`: `low` / `medium` / `high` / `critical`

`status` を `done` に変更すると `completedAt` が自動セットされる。
done から戻すと `completedAt` がクリアされる。

## DB スキーマ

`tasks` テーブル:

| カラム | 型 | 説明 |
|------|---|------|
| id | TEXT PK | タスクID |
| owner_id | TEXT NOT NULL | 作成者 |
| assignee_id | TEXT | 担当者 (null = 未アサイン) |
| group_id | TEXT | グループID |
| title | TEXT NOT NULL | タイトル |
| description | TEXT | 説明 |
| requirements | TEXT | 要件 (Markdown) |
| status | TEXT NOT NULL | open / in_progress / blocked / done / cancelled |
| priority | TEXT NOT NULL | low / medium / high / critical |
| deadline | TIMESTAMP | 期限 (null = 期限なし) |
| estimated_minutes | INTEGER | 見積もり作業時間 (分) |
| plugin_id | TEXT | 生成元プラグイン ID |
| plugin_ref | TEXT | プラグイン側参照 ID |
| plugin_payload | JSON | プラグイン固有データ |
| completed_at | TIMESTAMP | 完了時刻 |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

## プラグインシステム

`TaskPlugin` インターフェース (`src/shared/types.ts`):

```typescript
interface TaskPlugin {
  id: string;             // "pm", "machina", "reminder" 等
  name: string;
  description: string;
  icon?: string;
  apiBasePath?: string;
  frontendPath?: string;
  managed: "core" | "external";
}
```

登録は各モジュール初期化時に `registerTaskPlugin()`:

```typescript
import { registerTaskPlugin } from "../../src/task-plugins.js";

registerTaskPlugin({
  id: "pm",
  name: "PM (Project Management)",
  description: "GitHub / Notion 連携タスク",
  icon: "Kanban",
  apiBasePath: "/api/pm",
  frontendPath: "/pm",
  managed: "external",
});
```

## 既存モジュールとの関係

現行の以下モジュールは将来 Task プラグインとして再分類予定:
- `modules/pm/` (pm_tasks) — managed: external
- `modules/reminder/` — managed: external (タスクのリマインド機能)

※既存モジュール側の改修は別 PR で実施。
