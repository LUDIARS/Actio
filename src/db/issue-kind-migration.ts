/**
 * kind=issue 導入前の通常のバグ報告タスクを issue へ移す (spec/feature/public-issues.md §2)。
 * Castra のスキル bug-report は kind=task・source=cc-command・source_ref=bug:<client_key> で登録していた。
 * source と source_ref で特定できるので、それ以外のタスクは触らない。何度流しても結果は同じ。
 */
export const LEGACY_BUG_REPORT_TO_ISSUE_SQL =
  "UPDATE tasks SET kind = 'issue' WHERE kind = 'task' AND source = 'cc-command' AND source_ref LIKE 'bug:%'";
