# machina_channel_monitors

> グループごとに Slack/Discord のどのチャンネルを監視するかを設定する。
>
> ⚠️ MACHINA バックエンドは Discutere リポジトリに分離済み。テーブルは互換目的で残存。

- **ソース**: `src/db/schema.ts`
- **モジュール**: M3 / MACHINA (旧)

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | レコード ID |
| `group_id` | text | NOT NULL, FK → `groups.id` | グループ ID |
| `platform` | text | NOT NULL | `slack` / `discord` |
| `channel_id` | text | NOT NULL | チャンネル ID (Slack/Discord) |
| `channel_name` | text | NOT NULL | チャンネル名 (表示用) |
| `webhook_endpoint_id` | text | nullable | 受信用 `webhook_endpoints.id` |
| `is_active` | integer (boolean) | NOT NULL, default `true` | 有効/無効 |
| `created_by` | text | NOT NULL | 作成者ユーザー ID |
| `created_at` | integer (timestamp) | NOT NULL, default `now()` | 作成日時 |
| `updated_at` | integer (timestamp) | NOT NULL, default `now()` | 更新日時 |

## インデックス / ユニーク制約

- PK: `id`
- UNIQUE: `(group_id, platform, channel_id)` — `unique_machina_monitor_channel`
- INDEX: `(group_id)` — `idx_machina_monitor_group`
- FK: `group_id` → `groups.id`
