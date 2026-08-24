import type { CreateTaskInput } from "../../../src/shared/types.js";

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
  if (fields.source != null && (typeof fields.source !== "string" || fields.source.length === 0 || fields.source.length > 128)) {
    return "source must be a non-empty string of at most 128 characters";
  }
  if (fields.sourceRef != null && (typeof fields.sourceRef !== "string" || fields.sourceRef.length === 0 || fields.sourceRef.length > 512)) {
    return "source_ref must be a non-empty string of at most 512 characters";
  }
  if (fields.storyPoints != null && (!Number.isInteger(fields.storyPoints) || fields.storyPoints <= 0)) {
    return "story_points must be a positive integer";
  }
  return undefined;
}
