/**
 * GET /api/tasks のキーセットページ分け用の索引 (spec/feature/task-list-api.md)。
 *
 * 一覧は scope ごとに owner_id / assignee_id / team_id で絞り、 updated_at desc, id desc で
 * 並べて次ページを引く。 絞り込み列 + 並び列の複合索引で、 件数が増えても先頭ページが
 * 索引走査だけで返るようにする。 SQLite と PostgreSQL は同じ DDL を使う
 * (MySQL は Drizzle のテーブル定義側に同じ索引を宣言している)。
 */
export const TASK_LIST_INDEX_DDL: readonly string[] = [
  "CREATE INDEX IF NOT EXISTS idx_task_owner_updated ON tasks(owner_id, updated_at, id)",
  "CREATE INDEX IF NOT EXISTS idx_task_assignee_updated ON tasks(assignee_id, updated_at, id)",
  "CREATE INDEX IF NOT EXISTS idx_task_team_updated ON tasks(team_id, updated_at, id)",
  "CREATE INDEX IF NOT EXISTS idx_task_updated ON tasks(updated_at, id)",
];
