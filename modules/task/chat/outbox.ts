// @implements AT-SPRINT-CHAT-INTEGRATION
import { createHash } from "node:crypto";
import type { Program } from "../sprint-gates/query.js";
import { ChatRecords, readRecord, writeRecord } from "./records.js";
import type { Operation, ChatOperation, Intake, Surface } from "./contracts.js";
import { ChatError } from "./contracts.js";

export function operationId(key: string): string { return createHash("sha256").update(key).digest("hex").slice(0, 32); }
export function* enqueue(team: string, key: string, payload: ChatOperation, now: Date): Program<void> {
  const id = operationId(key);
  if (yield* readRecord<Operation>(team, "outbox", id)) return;
  const op: Operation = { id, teamId: team, payload, state: "queued", resultId: null, lastError: null, createdAt: now.toISOString() };
  yield* writeRecord(team, "outbox", id, op, now, op.state);
}
export class ChatOutbox {
  constructor(private readonly records: ChatRecords) {}
  enqueue(team: string, key: string, payload: ChatOperation, now: Date): Promise<void> {
    return this.records.transaction(team, function* () { yield* enqueue(team, key, payload, now); });
  }
  async pending(team: string): Promise<Operation[]> {
    return (await this.records.allOfKind<Operation>("outbox"))
      .filter(op => op.teamId === team && ["queued", "sending", "unknown"].includes(op.state))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }
  claim(op: Operation, now: Date): Promise<Operation | null> {
    return this.records.transaction(op.teamId, function* () {
      const current = yield* readRecord<Operation>(op.teamId, "outbox", op.id);
      if (!current || ["sent", "failed"].includes(current.state)) return null;
      // Keep the prior state in the returned value so transports know whether reconciliation is mandatory.
      yield* writeRecord(op.teamId, "outbox", op.id, { ...current, state: "sending" }, now, "sending");
      return current;
    });
  }
  finish(op: Operation, result: { id: string } | Error, now: Date): Promise<void> {
    return this.records.transaction(op.teamId, function* () {
      const current = yield* readRecord<Operation>(op.teamId, "outbox", op.id);
      if (!current || current.state === "sent") return;
      if (result instanceof Error) {
        const state = result instanceof ChatError && result.status === 400 ? "failed" : "unknown";
        yield* writeRecord(op.teamId, "outbox", op.id, { ...current, state, lastError: result.message }, now, state);
        return;
      }
      yield* writeRecord(op.teamId, "outbox", op.id, { ...current, state: "sent", resultId: result.id, lastError: null }, now, "sent");
      if (op.payload.kind === "thread") {
        const intake = yield* readRecord<Intake>(op.teamId, "intake", op.payload.intakeId);
        if (intake) yield* writeRecord(op.teamId, "intake", intake.id, { ...intake, threadId: result.id }, now, intake.state, intake.revision);
      }
      if (op.payload.kind === "channel" || op.payload.kind === "archive") {
        const surface = yield* readRecord<Surface>(op.teamId, "surface", op.payload.sprintId);
        if (surface) yield* writeRecord(op.teamId, "surface", surface.sprintId, {
          ...surface, channelId: result.id, state: op.payload.kind === "archive" ? "archived" : "active", lastError: null,
        }, now);
      }
    });
  }
}
