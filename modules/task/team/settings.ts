import { z } from "zod";

export const TeamSettingsSchema = z.object({
  input_mode: z.enum(["minimal", "full"]).default("minimal"),
  default_daily_minutes: z.number().int().positive().default(120),
  sprint_length_days: z.number().int().positive().default(7),
  review_slots: z.array(z.string()).default(["09:00", "18:00"]),
  completion_threshold: z.number().min(0).max(1).default(0.8),
  delay_grace_days: z.number().int().min(0).default(0), daily_stale_days: z.number().int().min(0).default(14),
  standup_enabled: z.boolean().default(true), timezone: z.string().default("Asia/Tokyo"),
  wip_limit_per_member: z.number().int().positive().default(2), minutes_per_point: z.number().int().positive().default(60),
  work_window: z.record(z.string(), z.unknown()).default({}), dod: z.array(z.string()).default([]),
  phase: z.string().default("prototype"), phase_targets: z.record(z.string(), z.unknown()).default({}),
});

export type TeamSettings = z.infer<typeof TeamSettingsSchema>;
export function defaultTeamSettings(): TeamSettings { return TeamSettingsSchema.parse({}); }
