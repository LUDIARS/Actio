import { z } from "zod";

const TimeOfDaySchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

export const TeamSettingsSchema = z.object({
  input_mode: z.enum(["minimal", "full"]).default("minimal"),
  default_daily_minutes: z.number().int().positive().default(120),
  sprint_length_days: z.number().int().positive().default(7),
  review_slots: z.array(TimeOfDaySchema).default(["09:00", "18:00"]),
  completion_threshold: z.number().min(0).max(1).default(0.8),
  delay_grace_days: z.number().int().min(0).default(0),
  daily_stale_days: z.number().int().min(0).default(14),
  standup_enabled: z.boolean().default(true),
  timezone: z.string().min(1).default("Asia/Tokyo"),
  wip_limit_per_member: z.number().int().positive().default(2),
  minutes_per_point: z.number().int().positive().default(60),
  work_window: z.tuple([TimeOfDaySchema, TimeOfDaySchema]).default(["10:00", "23:00"]),
  dod: z.array(z.string().min(1)).default([]),
  phase: z.enum(["concept", "prototype", "production", "polish", "release", "maintenance"]).default("prototype"),
  phase_targets: z.record(z.string(), z.unknown()).default({}),
});

export type TeamSettings = z.infer<typeof TeamSettingsSchema>;
export type TeamInputMode = TeamSettings["input_mode"];

export function defaultTeamSettings(): TeamSettings {
  return TeamSettingsSchema.parse({});
}

/** Missing cache rows use the documented default; malformed stored settings fail closed. */
export function readTeamInputMode(settings: unknown): TeamInputMode {
  return settings === undefined ? defaultTeamSettings().input_mode : TeamSettingsSchema.parse(settings).input_mode;
}
