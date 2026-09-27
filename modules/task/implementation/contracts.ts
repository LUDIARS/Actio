import { z } from "zod";

export const subjectSchema = z.object({ kind: z.enum(["spec", "scenario"]), id: z.string().min(1),
  title: z.string(), revision: z.string().min(1), description: z.string() });
export const manifestSchema = z.object({ projectId: z.string(), teamId: z.string(), subjects: z.array(subjectSchema) });
export type ImplementationSubject = z.infer<typeof subjectSchema>;
export type ImplementationState = "unregistered" | "in_progress" | "returned" | "specification_changed" | "awaiting_confirmation" | "completed";
export interface ImplementationTask { id: string; title: string; status: string; revision: number; specificationRevision: string; isBacklog: boolean }
export interface ImplementationReview {
  kind: "spec" | "scenario"; id: string; title: string; specificationRevision: string;
  state: ImplementationState; fingerprint: string; tasks: ImplementationTask[];
  confirmation: { actorId: string; confirmedAt: string; note: string } | null;
}
const guard = { fingerprint: z.string().min(1), note: z.string().trim().min(1).max(5000) };
export const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("link"), ...guard, taskId: z.string().min(1) }).strict(),
  z.object({ action: z.literal("backlog"), ...guard, title: z.string().trim().min(1).max(200),
    assigneeId: z.string().min(1), deadline: z.iso.datetime({ offset: true }), estimatedMinutes: z.number().int().positive() }).strict(),
  z.object({ action: z.literal("confirm"), ...guard }).strict(),
]);
export type ImplementationAction = z.infer<typeof actionSchema>;
