/**
 * 「現在のスプリント + 未割付バックログ」 だけを選ぶ (純粋関数)。
 * spec/feature/task-integration/spec.md §3.1
 */

export const TASK_VIEWS = ["current_sprint"] as const;
export type TaskView = (typeof TASK_VIEWS)[number];

const CLOSED_STATUSES = new Set(["done", "cancelled"]);

export interface ViewTask {
  lane: string;
  sprintId: string | null;
  status: string;
}

export interface ViewSprint {
  id: string;
  status: string;
}

/** 完了系 (done / cancelled) か。 未完了の判定はこれの否定で揃える。 */
export function isClosedStatus(status: string): boolean {
  return CLOSED_STATUSES.has(status);
}

export function isTaskView(value: unknown): value is TaskView {
  return typeof value === "string" && (TASK_VIEWS as readonly string[]).includes(value);
}

/** チームの進行中スプリント (SprintStore がチームにつき 1 件までを保証する)。 */
export function findCurrentSprint<S extends ViewSprint>(sprints: readonly S[]): S | null {
  return sprints.find((sprint) => sprint.status === "active") ?? null;
}

export function selectCurrentSprintView<T extends ViewTask, S extends ViewSprint>(
  tasks: readonly T[],
  sprints: readonly S[],
): { currentSprint: S | null; tasks: T[] } {
  const currentSprint = findCurrentSprint(sprints);
  const selected = tasks.filter((task) => {
    // Everything in the running sprint stays visible, including finished work, to show progress.
    if (currentSprint && task.sprintId === currentSprint.id) return true;
    return task.lane === "backlog" && task.sprintId === null && !isClosedStatus(task.status);
  });
  return { currentSprint, tasks: selected };
}
