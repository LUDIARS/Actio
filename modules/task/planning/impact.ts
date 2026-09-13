import type { BacklogTask, Sprint } from "./contracts.js";

export interface SprintImpact {
  estimatedMinutes: number; unknownEstimates: number; projectedEndsOn: string | null;
  state: "unknown" | "reschedule" | "buffer" | "within"; overdueTaskIds: string[];
}

/** Capacity is a human estimate for one cadence; unknown effort stays visible. */
export function sprintImpact(sprint: Sprint, tasks: BacklogTask[]): SprintImpact {
  const pending = tasks.filter(t => t.sprintId === sprint.id && !["done", "cancelled"].includes(t.status));
  const unknownEstimates = pending.filter(t => t.estimatedMinutes === null).length;
  const estimatedMinutes = pending.reduce((sum, t) => sum + (t.estimatedMinutes ?? 0), 0);
  let projectedEndsOn: string | null = null;
  if (sprint.capacityMinutes && unknownEstimates === 0) {
    const days = Math.max(1, Math.ceil(estimatedMinutes / sprint.capacityMinutes * sprint.cadenceDays));
    const end = new Date(`${sprint.startsOn}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + days - 1);
    if (Number.isFinite(end.getTime())) projectedEndsOn = end.toISOString().slice(0, 10);
  }
  const state = projectedEndsOn === null ? "unknown" : projectedEndsOn > sprint.bufferEndsOn ? "reschedule"
    : projectedEndsOn > sprint.endsOn ? "buffer" : "within";
  return { estimatedMinutes, unknownEstimates, projectedEndsOn, state,
    overdueTaskIds: pending.filter(t => t.deadline !== null && new Date(t.deadline * 1000).toISOString().slice(0, 10) < (projectedEndsOn ?? sprint.endsOn)).map(t => t.id),
  };
}
