import type { ProjectLookupRow } from "./validation/team-project.js";

/**
 * Preserve work awaiting team registration using the existing category/tag vocabulary.
 * @implements SPEC-AT-UNASSIGNED-INTAKE
 */
export async function classifyUnassignedIntake(
  input: { teamId: string | null; projectId: string | null; source: string | null; category: string | null },
  findProject: (code: string) => Promise<ProjectLookupRow | undefined>,
): Promise<string | null> {
  if (input.teamId || (!input.projectId && input.source !== "concordia.taskflow.v3")) return input.category;
  const project = input.projectId ? await findProject(input.projectId) : undefined;
  // Opaque external project references keep their existing personal-task semantics.
  if (!project && input.source !== "concordia.taskflow.v3") return input.category;
  if (project && !project.removedAt && project.teamIds.length > 0) return input.category;
  // Explicitly requested by neco: unresolved team registration must not discard a task.
  const labels = (input.category ?? "").split(",").map((label) => label.trim()).filter(Boolean);
  return [...new Set(["一時登録", "要整理", ...labels])].join(", ");
}
