import { assessGuidance as assess, GuidanceError, type GuidanceInput, type GuidanceReport } from "@ludiars/terpsichore";
import { PlanningError, type BacklogTask, type Sprint } from "../planning/contracts.js";

/** Translate independent domain failures into Actio's existing HTTP error contract. */
export function assessGuidance(input: GuidanceInput, tasks: BacklogTask[], sprints: Sprint[], now: Date): GuidanceReport {
  try { return assess(input, tasks, sprints, now); }
  catch (error) {
    if (error instanceof GuidanceError) throw new PlanningError(error.message, error.code === "sprint_not_found" ? 404 : 409);
    throw error;
  }
}
