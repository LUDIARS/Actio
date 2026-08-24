export type TeamTaskLane = "daily" | "backlog";
export interface TeamTaskInput {
  id?: string;
  teamId: string | null;
  assigneeId?: string | null;
  lane?: TeamTaskLane;
  sprintId?: string | null;
  deadline?: Date | null;
  deadlineSource?: string | null;
  durationDays?: number | null;
  blockedBy?: string[] | null;
}

export interface TeamTaskValidationDeps {
  isMember(teamId: string, userId: string): boolean | Promise<boolean>;
  isTaskInTeam(teamId: string, taskId: string): boolean | Promise<boolean>;
}

export interface TeamTaskValidationResult {
  value: Required<Pick<TeamTaskInput, "lane">> & TeamTaskInput;
  error?: string;
}

export async function validateTeamTask(input: TeamTaskInput, inputMode: "minimal" | "full", deps: TeamTaskValidationDeps): Promise<TeamTaskValidationResult> {
  const lane = input.durationDays != null && input.lane == null ? "backlog" : input.lane ?? "daily";
  const value = { ...input, lane };
  if (lane !== "daily" && lane !== "backlog") return { value, error: "lane must be daily or backlog" };
  if (input.durationDays != null && (!Number.isInteger(input.durationDays) || input.durationDays <= 0)) {
    return { value, error: "duration_days must be a positive integer" };
  }
  if (input.blockedBy !== undefined && (!Array.isArray(input.blockedBy) || input.blockedBy.some((taskId) => typeof taskId !== "string" || taskId.length === 0))) {
    return { value, error: "blocked_by must be an array of task ids" };
  }
  if (input.sprintId != null && (typeof input.sprintId !== "string" || input.sprintId.length === 0)) {
    return { value, error: "sprint_id must be a non-empty string" };
  }
  if (input.teamId == null) return { value };
  if (typeof input.teamId !== "string" || input.teamId.length === 0) return { value, error: "team_id must be a non-empty string" };
  if (!input.assigneeId) return { value, error: "assignee_id is required for team tasks" };
  if (typeof input.assigneeId !== "string") return { value, error: "assignee_id must be a string" };
  if (!await deps.isMember(input.teamId, input.assigneeId)) return { value, error: "assignee_id must be a team member" };
  if (lane === "backlog" && inputMode === "full" && !input.deadline) return { value, error: "deadline is required for full backlog input" };
  if (lane === "daily" && input.deadline) return { value, error: "daily tasks cannot have a deadline" };
  for (const taskId of input.blockedBy ?? []) {
    if (taskId === input.id) return { value, error: "blocked_by cannot reference itself" };
    if (!await deps.isTaskInTeam(input.teamId, taskId)) return { value, error: "blocked_by tasks must belong to the same team" };
  }
  return { value };
}

export function validateLaneTransition(current: TeamTaskInput, next: Pick<TeamTaskInput, "lane" | "deadline" | "durationDays">): { deadline: Date | null | undefined; error?: string } {
  if (next.durationDays != null && (!Number.isInteger(next.durationDays) || next.durationDays <= 0)) {
    return { deadline: next.deadline, error: "duration_days must be a positive integer" };
  }
  if (current.lane === "daily" && next.lane === "backlog" && !next.deadline && !next.durationDays) return { deadline: next.deadline, error: "daily to backlog requires deadline or duration_days" };
  if (current.lane === "backlog" && next.lane === "daily") {
    if (current.sprintId) return { deadline: next.deadline, error: "backlog tasks in a sprint cannot move to daily" };
    return { deadline: current.deadlineSource === "auto" ? null : next.deadline };
  }
  return { deadline: next.deadline };
}
