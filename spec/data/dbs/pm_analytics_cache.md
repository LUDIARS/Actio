# pm_analytics_cache

> 分析レポートキャッシュ (進捗・クリティカルパス・ゴンペルツ など)。

- **ソース**: `src/db/pm-schema.ts`
- **モジュール**: M2 / PM

## カラム

| カラム | 型 | 制約 / デフォルト | 説明 |
|--------|-----|------------------|------|
| `id` | text | PRIMARY KEY | キャッシュ ID |
| `project_id` | text | NOT NULL | プロジェクト ID |
| `report_type` | text | NOT NULL | `progress` / `critical_path` / `gompertz` |
| `data` | text (JSON `Record<string, unknown>`) | NOT NULL, default `{}` | レポートデータ |
| `generated_at` | text | NOT NULL | 生成日時 (ISO 8601) |
| `expires_at` | text | NOT NULL | 有効期限 (ISO 8601) |

## インデックス / ユニーク制約

- PK: `id`
- INDEX: `(project_id, report_type)` — `idx_pm_cache_project_type`
