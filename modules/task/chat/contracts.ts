// @implements AT-SPRINT-CHAT-INTEGRATION
import { z } from "zod";

export const identifier = z.string().trim().min(1).max(200);
const snowflake = z.string().regex(/^\d{5,25}$/);
export const connectionInput = z.object({
  platform: z.enum(["discord", "slack"]),
  workspaceId: identifier,
  backlogChannelId: identifier,
  categoryId: identifier.optional(),
  archiveCategoryId: identifier.optional(),
  tokenRef: z.string().regex(/^ACTIO_DISCORD_[A-Z0-9_]+$/).optional(),
  dailyAt: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/).default("09:00"),
  timezone: z.string().refine(value => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return true; } catch { return false; }
  }, "有効なタイムゾーンを指定してください").default("Asia/Tokyo"),
  enabled: z.boolean().default(false),
  joinDiscussion: z.boolean().default(false),
}).strict().superRefine((value, ctx) => {
  if (value.platform === "discord") {
    for (const key of ["workspaceId", "backlogChannelId", "categoryId", "archiveCategoryId"] as const) {
      if (value[key] !== undefined && !snowflake.safeParse(value[key]).success)
        ctx.addIssue({ code: "custom", path: [key], message: "Discord ID を指定してください" });
    }
  }
});
export type Connection = z.infer<typeof connectionInput> & { teamId: string; revision: number; enabledAt?: string };
export interface Message {
  id: string; teamId: string; channelId: string; parentId: string | null;
  content: string; actorId: string | null; bot: boolean; deleted: boolean;
  occurredAt: string; editedAt: string | null; url: string;
  attachments: { name: string; url: string }[];
}
export interface IncomingMessage extends Omit<Message, "teamId" | "actorId"> {
  externalActorId: string | null;
}
export const reviewResult = z.object({
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().max(4000),
  change: z.string().trim().max(12000),
  acceptance: z.array(z.string().trim().min(1).max(1000)).max(30),
  questions: z.array(z.string().trim().min(1).max(1000)).max(20),
  concerns: z.array(z.string().trim().min(1).max(1000)).max(20),
}).strict();
export type IntakeReview = z.infer<typeof reviewResult>;
export interface Intake {
  id: string; teamId: string; channelId: string; messageId: string; threadId: string | null;
  revision: number; content: string; sourceDeleted: boolean;
  state: "checking" | "needs_information" | "needs_review" | "registered";
  review: IntakeReview | null; reviewedRevision: number | null;
  reviewError: string | null; taskId: string | null; confirmedBy: string | null;
}
export const confirmIntake = z.object({
  revision: z.number().int().positive(),
  title: z.string().trim().min(1).max(200),
  purpose: z.string().trim().min(1).max(4000),
  change: z.string().trim().min(1).max(12000),
  acceptance: z.array(z.string().trim().min(1).max(1000)).min(1).max(30),
  reviewNote: z.string().trim().min(1).max(4000),
  projectId: identifier.nullable().default(null),
  assigneeId: identifier.nullable().default(null),
  deadline: z.string().datetime().nullable().default(null),
}).strict();
export type Confirmation = z.infer<typeof confirmIntake>;
export interface Surface {
  teamId: string; sprintId: string; channelId: string | null;
  state: "pending" | "active" | "archive_pending" | "archived";
  lastRevision: number; lastError: string | null; logCaughtUp: boolean;
}
export type ChatOperation =
  | { kind: "message"; channelId: string; text: string }
  | { kind: "thread"; channelId: string; messageId: string; name: string; intakeId: string }
  | { kind: "channel"; sprintId: string; name: string }
  | { kind: "archive"; sprintId: string; channelId: string };
export interface Operation {
  id: string; teamId: string; payload: ChatOperation;
  state: "queued" | "sending" | "sent" | "unknown" | "failed";
  resultId: string | null; lastError: string | null; createdAt: string;
}
export interface Transport {
  threads(connection: Connection, channelId: string): Promise<string[]>;
  deleted(connection: Connection, channelId: string, ids: string[]): Promise<string[]>;
  validate(connection: Connection): Promise<void>;
  /** Provider must reconcile unknown outcomes before repeating external mutations. */
  deliver(connection: Connection, operation: Operation): Promise<{ id: string }>;
  messages(connection: Connection, channelId: string, cursor: string | null): Promise<{ messages: IncomingMessage[]; cursor: string | null; complete: boolean }>;
  close(): void;
}
export class ChatError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 404 | 409 | 503 = 409) { super(message); }
}
