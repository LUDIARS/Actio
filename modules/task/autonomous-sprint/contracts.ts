import { z } from "zod";

const id = z.string().trim().min(1).max(200);
const expectedRevision = z.number().int().min(0).max(2147483646);
const stalledAfterMinutes = z.number().int().min(1).max(10080);
const reason = z.string().trim().min(1).max(2000);

export const enrollInput = z.object({ sprintId: id, clientId: id, stalledAfterMinutes: stalledAfterMinutes.default(1440) }).strict();
export const controlInput = z.discriminatedUnion("action", [
  z.object({ action: z.literal("policy"), expectedRevision, stalledAfterMinutes, nextSprintId: id.nullable(), reason }).strict(),
  z.object({ action: z.enum(["pause", "resume", "intervene", "reconcile"]), expectedRevision, reason }).strict(),
]);
export const releaseInput = z.object({ expectedRevision, reason }).strict();
export const claimInput = z.object({ expectedRevision, taskId: id }).strict();

export type ControlInput = z.infer<typeof controlInput>;
export type LoopStatus = "running" | "paused";
export type LoopWarning = "breaker_open" | "breaker_unavailable" | "phase_blocked" | "task_stalled" | "scope_changed" | "client_disabled";

export interface LoopRun {
  id: string;
  teamId: string;
  sprintId: string;
  clientId: string;
  status: LoopStatus;
  revision: number;
  cycle: number;
  stalledAfterMinutes: number;
  nextSprintId: string | null;
  claimId: string | null;
  taskId: string | null;
  claimedAt: string | null;
  warning: LoopWarning | null;
}

export interface LoopProgress {
  total: number;
  done: number;
  cancelled: number;
  blocked: number;
  stalledTaskIds: string[];
}
