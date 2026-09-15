/**
 * DB のタスク行を通知判定用のスナップショットに写す。
 */

import type { TaskSnapshot } from "./events.js";

export interface TaskRowForSnapshot {
  id: string;
  title: string;
  teamId: string | null;
  ownerId: string;
  assigneeId: string | null;
  status: string;
  priority: string;
  executorType: string;
  aiExecutor: string | null;
  deadline: Date | null;
  updatedAt: Date;
}

export function toTaskSnapshot(row: TaskRowForSnapshot): TaskSnapshot {
  return {
    id: row.id,
    title: row.title,
    teamId: row.teamId,
    ownerId: row.ownerId,
    assigneeId: row.assigneeId,
    status: row.status,
    priority: row.priority,
    executorType: row.executorType,
    aiExecutor: row.aiExecutor,
    deadline: row.deadline,
    updatedAt: row.updatedAt,
  };
}
