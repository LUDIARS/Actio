import { createHash } from "node:crypto";
import type { ImplementationReview, ImplementationSubject, ImplementationTask } from "./contracts.js";

/** Task completion and human acceptance are separate facts. Missing/cancelled work never counts as done. */
export function reviewState(subject: ImplementationSubject, tasks: ImplementationTask[], confirmation: ImplementationReview["confirmation"]): ImplementationReview["state"] {
  if (!tasks.length) return "unregistered";
  if (!tasks.some(task => task.specificationRevision === subject.revision)) return "specification_changed";
  const unfinished = tasks.filter(task => task.status !== "done");
  if (unfinished.length) return unfinished.some(task => task.isBacklog) ? "returned" : "in_progress";
  return confirmation ? "completed" : "awaiting_confirmation";
}
export function reviewFingerprint(subject: ImplementationSubject, tasks: ImplementationTask[]): string {
  return createHash("sha256").update(JSON.stringify({ revision: subject.revision,
    tasks: [...tasks].sort((a, b) => a.id.localeCompare(b.id)) })).digest("hex");
}
