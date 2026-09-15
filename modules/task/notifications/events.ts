/**
 * タスク / スプリントの変化から通知の意図を作る (純粋関数)。
 * spec/feature/task-integration/spec.md §2.1
 *
 * 本文に個人の表示名は入れない (個人データの正本は Cernere)。 担当者は id でだけ扱い、
 * 配送先 (Cc チーム面 / Memoria) が表示を担う。
 */

export const TASK_NOTIFICATION_EVENTS = [
  "task.assigned",
  "task.completed",
  "task.priority_raised",
  "task.deadline_soon",
  "task.executor_changed",
  "sprint.started",
  "sprint.closed",
] as const;
export type TaskNotificationEvent = (typeof TASK_NOTIFICATION_EVENTS)[number];

export interface TaskSnapshot {
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

export interface SprintSnapshot {
  id: string;
  teamId: string;
  name: string;
  startsOn: string;
  endsOn: string;
}

export interface NotificationIntent {
  event: TaskNotificationEvent;
  taskId: string | null;
  teamId: string | null;
  recipientIds: string[];
  title: string;
  body: string;
  /** 同じ変化を 2 回積まないためのキー。 */
  dedupeKey: string;
}

const PRIORITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };

function unique(ids: readonly (string | null)[]): string[] {
  return [...new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0))];
}

function executorLabel(task: Pick<TaskSnapshot, "executorType" | "aiExecutor">): string {
  if (task.executorType !== "ai") return "人間";
  return task.aiExecutor ? `AI (${task.aiExecutor})` : "AI (未割り当て)";
}

export function taskChangeNotifications(before: TaskSnapshot | null, after: TaskSnapshot): NotificationIntent[] {
  const intents: NotificationIntent[] = [];
  const version = after.updatedAt.toISOString();
  const base = { taskId: after.id, teamId: after.teamId };

  if (after.assigneeId && after.assigneeId !== (before?.assigneeId ?? null) && after.assigneeId !== after.ownerId) {
    intents.push({
      ...base,
      event: "task.assigned",
      recipientIds: [after.assigneeId],
      title: `担当が割り当てられました: ${after.title}`,
      body: `作業者: ${executorLabel(after)}`,
      dedupeKey: `task.assigned:${after.id}:${after.assigneeId}:${version}`,
    });
  }
  if (before && before.status !== "done" && after.status === "done") {
    intents.push({
      ...base,
      event: "task.completed",
      recipientIds: unique([after.ownerId, after.assigneeId]),
      title: `タスクが完了しました: ${after.title}`,
      body: `作業者: ${executorLabel(after)}`,
      dedupeKey: `task.completed:${after.id}:${version}`,
    });
  }
  if (before && (PRIORITY_RANK[after.priority] ?? 0) > (PRIORITY_RANK[before.priority] ?? 0)) {
    intents.push({
      ...base,
      event: "task.priority_raised",
      recipientIds: unique([after.assigneeId ?? after.ownerId]),
      title: `優先度が上がりました: ${after.title}`,
      body: `${before.priority} → ${after.priority}`,
      dedupeKey: `task.priority_raised:${after.id}:${after.priority}:${version}`,
    });
  }
  if (before && (before.executorType !== after.executorType || before.aiExecutor !== after.aiExecutor)) {
    intents.push({
      ...base,
      event: "task.executor_changed",
      recipientIds: unique([after.assigneeId ?? after.ownerId]),
      title: `作業者が変わりました: ${after.title}`,
      body: `${executorLabel(before)} → ${executorLabel(after)}`,
      dedupeKey: `task.executor_changed:${after.id}:${after.executorType}:${after.aiExecutor ?? ""}:${version}`,
    });
  }
  return intents;
}

/** 期限の notifyBeforeMinutes 前に入っていれば 1 件。 期限ごとに 1 回だけになるよう期限をキーに含める。 */
export function deadlineSoonNotification(task: TaskSnapshot, now: Date, notifyBeforeMinutes: number): NotificationIntent | null {
  if (!task.deadline || task.status === "done" || task.status === "cancelled") return null;
  const remainingMs = task.deadline.getTime() - now.getTime();
  if (remainingMs <= 0 || remainingMs > notifyBeforeMinutes * 60_000) return null;
  const minutes = Math.max(1, Math.round(remainingMs / 60_000));
  return {
    event: "task.deadline_soon",
    taskId: task.id,
    teamId: task.teamId,
    recipientIds: unique([task.assigneeId ?? task.ownerId]),
    title: `期限が近づいています: ${task.title}`,
    body: `残り約 ${minutes} 分 (期限 ${task.deadline.toISOString()})`,
    dedupeKey: `task.deadline_soon:${task.id}:${task.deadline.toISOString()}`,
  };
}

export function sprintNotification(kind: "started" | "closed", sprint: SprintSnapshot): NotificationIntent {
  const event: TaskNotificationEvent = kind === "started" ? "sprint.started" : "sprint.closed";
  return {
    event,
    taskId: null,
    teamId: sprint.teamId,
    recipientIds: [],
    title: kind === "started" ? `スプリント開始: ${sprint.name}` : `スプリント終了: ${sprint.name}`,
    body: `${sprint.startsOn} 〜 ${sprint.endsOn}`,
    dedupeKey: `${event}:${sprint.id}`,
  };
}
