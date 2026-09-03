import type { CreateTaskInput } from "../../../src/shared/types.js";

const TASK_SOURCES = [
  "manual",
  "cc-taskmd",
  "cc-rwf",
  "cc-command",
  "memoria-import",
  "sprint-plan",
] as const;

function isLocationReference(value: string): boolean {
  return value.startsWith("/")
    || value.startsWith("\\\\")
    || /^[a-z]:[\\/]/i.test(value)
    || /^file:/i.test(value)
    || /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
}

export interface TeamTaskRequestFields {
  teamId: string | null | undefined;
  lane: "daily" | "backlog" | undefined;
  sprintId: string | null | undefined;
  durationDays: number | null | undefined;
  source: string | null | undefined;
  sourceRef: string | null | undefined;
  blockedBy: string[] | null | undefined;
  storyPoints: number | null | undefined;
}

export function readTeamTaskRequestFields(body: Partial<CreateTaskInput>): TeamTaskRequestFields {
  return {
    teamId: body.teamId !== undefined ? body.teamId : body.team_id,
    lane: body.lane,
    sprintId: body.sprintId !== undefined ? body.sprintId : body.sprint_id,
    durationDays: body.durationDays !== undefined ? body.durationDays : body.duration_days,
    source: body.source,
    sourceRef: body.sourceRef !== undefined ? body.sourceRef : body.source_ref,
    blockedBy: body.blockedBy !== undefined ? body.blockedBy : body.blocked_by,
    storyPoints: body.storyPoints !== undefined ? body.storyPoints : body.story_points,
  };
}

export function validateTeamTaskMetadata(fields: TeamTaskRequestFields): string | undefined {
  if ((fields.source == null) !== (fields.sourceRef == null)) return "source and source_ref must be provided together";
  if (fields.source != null && !TASK_SOURCES.includes(fields.source as (typeof TASK_SOURCES)[number])) {
    return `source must be one of: ${TASK_SOURCES.join(", ")}`;
  }
  if (fields.sourceRef != null && (typeof fields.sourceRef !== "string" || fields.sourceRef.length === 0 || fields.sourceRef.length > 512)) {
    return "source_ref must be a non-empty string of at most 512 characters";
  }
  if (fields.sourceRef != null && (isLocationReference(fields.sourceRef) || /[\0\r\n]/.test(fields.sourceRef))) {
    return "source_ref must be an opaque id or repository-relative path, not an absolute path or URL";
  }
  if (fields.storyPoints != null && (!Number.isInteger(fields.storyPoints) || fields.storyPoints <= 0)) {
    return "story_points must be a positive integer";
  }
  return undefined;
}
