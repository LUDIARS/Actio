# チーム別タスク管理コード構成

- `src/db/team-task-schema.ts`: SQLite 用の T1 チームタスク関連 Drizzle 定義
- `src/db/dialects/{postgres,mysql}.ts`: 各方言の task 拡張列とチーム所属確認用 schema
- `modules/task/team/settings.ts`: Actio 固有チーム設定の既定値と Zod 検証
- `modules/task/validation/team-task.ts`: レーン・担当・依存関係の純粋検証
- `modules/task/validation/team-task-request.ts`: チームタスク API の snake_case / camelCase 入力正規化
- `modules/task/team-routes.ts`: レーン変更 API
- `modules/task/team/cc-sync.ts`: Cc `GET /v1/teams` → `team_refs` 同期 (起動時 + 10 分 tick、リポジトリ位置は破棄して `repo_ids` のみ保持)
- `modules/task/team-member-routes.ts`: チーム一覧・メンバー管理・チーム設定 API (`/api/teams`)
- `src/auth/team-role.ts`: `requireTeamRole` middleware (admin バイパス / Cc service 経路の `X-Decided-By` 必須) と裁定 scope 定義
- `src/db/repository.ts`: `teamRefRepo` / `teamMemberRepo` (Cc 同期 upsert・ロール正本)
