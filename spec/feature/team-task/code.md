# チーム別タスク管理コード構成

- `src/db/team-task-schema.ts`: SQLite 用の T1 チームタスク関連 Drizzle 定義
- `src/db/dialects/{postgres,mysql}.ts`: 各方言の task 拡張列とチーム所属確認用 schema
- `modules/task/team/settings.ts`: Actio 固有チーム設定の既定値と Zod 検証
- `modules/task/validation/team-task.ts`: レーン・担当・依存関係の純粋検証
- `modules/task/validation/team-task-request.ts`: チームタスク API の snake_case / camelCase 入力正規化
- `modules/task/team-routes.ts`: レーン変更 API
