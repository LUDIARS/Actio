/** タスク一覧の検索・絞り込み条件 (GET /api/tasks の q / category / assignee) */
export interface TaskSearchValues {
  /** title の部分一致 */
  q: string;
  category: string;
  /** 担当者のユーザ ID */
  assignee: string;
}

export const EMPTY_TASK_SEARCH: TaskSearchValues = { q: "", category: "", assignee: "" };
