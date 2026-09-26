import { z } from "zod";

export const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "実在する日付を指定してください");
const reason = z.string().trim().min(1).max(2000);
export const newSprint = z.object({
  name: z.string().trim().min(1).max(200), goal: z.string().max(5000).default(""),
  startsOn: calendarDate, endsOn: calendarDate, cadenceDays: z.number().int().min(1).max(366),
  bufferEndsOn: calendarDate,
  capacityMinutes: z.number().int().positive().nullable().default(null),
}).strict().refine(v => v.endsOn >= v.startsOn && v.bufferEndsOn >= v.endsOn, "開始日・締め切り・バッファ上限の順で指定してください");
export const sprintChange = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), revision: z.number().int().min(0), reason }).strict(),
  z.object({ action: z.literal("close"), revision: z.number().int().min(0), reason }).strict(),
  z.object({ action: z.literal("extend"), revision: z.number().int().min(0), endsOn: calendarDate, reason }).strict(),
  z.object({ action: z.literal("reschedule"), revision: z.number().int().min(0), startsOn: calendarDate, endsOn: calendarDate, bufferEndsOn: calendarDate,
    cadenceDays: z.number().int().min(1).max(366), capacityMinutes: z.number().int().positive().nullable(), reason }).strict(),
  z.object({ action: z.literal("assign"), revision: z.number().int().min(0), taskId: z.string().min(1), reason }).strict(),
  z.object({ action: z.literal("remove"), revision: z.number().int().min(0), taskId: z.string().min(1), reason }).strict(),
]);
export const groupInput = z.object({
  name: z.string().trim().min(1).max(200), reason,
  tasks: z.array(z.object({ id: z.string().min(1), fingerprint: z.string().min(1) }).strict()).min(2).max(200),
}).strict().refine(v => new Set(v.tasks.map(t => t.id)).size === v.tasks.length, "タスクが重複しています");
export const orderInput = z.object({ taskIds: z.array(z.string().min(1)).max(5000) }).strict()
  .refine(v => new Set(v.taskIds).size === v.taskIds.length, "タスクが重複しています");

export interface Sprint {
  id: string; teamId: string; name: string; goal: string | null; startsOn: string; endsOn: string;
  originalEndsOn: string; cadenceDays: number; status: "planning" | "active" | "closed";
  bufferEndsOn: string;
  capacityMinutes: number | null; revision: number;
}
export interface BacklogTask {
  id: string; title: string; description: string | null; requirements: string | null;
  status: string; priority: string; assigneeId: string | null; projectId: string | null;
  deadline: number | null; estimatedMinutes: number | null; sprintId: string | null;
  category: string | null; groupId: string | null; position: number; fingerprint: string;
  /** task-integration §4 / §5。 SQLite は is_critical_path を 0/1 で返す。 */
  executorType?: string; aiExecutor?: string | null; isCriticalPath?: boolean | number;
  slackDays?: number | null; criticalPathError?: string | null; blockedBy?: string[] | string; durationDays?: number | null;
}
/** MySQL 方言では計画機能を提供しない (501)。 */
export const PLANNING_UNSUPPORTED_MESSAGE = "計画機能は PostgreSQL または SQLite 配備で利用できます";
export class PlanningError extends Error {
  constructor(message: string, public readonly status: 400 | 404 | 409 = 409) { super(message); }
}
