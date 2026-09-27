// @implements AT-SPRINT-CHAT-INTEGRATION
import { ChatRecords, readRecord, writeRecord } from "./records.js";
import { enqueue, operationId } from "./outbox.js";
import type { Connection, Surface, Operation } from "./contracts.js";
import type { GateView } from "../sprint-gates/contracts.js";
import { localClock, sprintSummary } from "./summary.js";

/** State is committed independently of delivery. Closing waits for saved logs and delivered final summary. */
export async function publishSprint(records: ChatRecords, connection: Connection, view: GateView, now: Date, webUrl: string): Promise<void> {
  const team = connection.teamId, sprint = view.sprint;
  await records.transaction(team, function* () {
    let surface = yield* readRecord<Surface>(team, "surface", sprint.id);
    if (!surface) {
      // Historic closed sprints are not silently migrated or provisioned.
      if (sprint.status !== "active") return;
      surface = { teamId: team, sprintId: sprint.id, channelId: null, state: "pending", lastRevision: -1, lastError: null, logCaughtUp: false };
      yield* writeRecord(team, "surface", sprint.id, surface, now);
      yield* enqueue(team, `sprint-channel:${team}:${sprint.id}`, { kind: "channel", sprintId: sprint.id, name: `sprint-${sprint.name}` }, now);
      return;
    }
    if (!surface.channelId || surface.state === "archived") return;
    const channelId = surface.channelId;
    if (surface.lastRevision !== view.state.revision) {
      yield* enqueue(team, `sprint-phase:${team}:${sprint.id}:${view.state.revision}`, { kind: "message", channelId: surface.channelId,
        text: sprintSummary(view, webUrl, "スプリント更新・レビュー／評価／振り返り") }, now);
      surface = { ...surface, lastRevision: view.state.revision };
      yield* writeRecord(team, "surface", sprint.id, surface, now);
    }
    if (sprint.status === "closed") {
      const key = `sprint-final:${team}:${sprint.id}`;
      yield* enqueue(team, key, { kind: "message", channelId, text: sprintSummary(view, webUrl, "終了サマリ") }, now);
      yield* writeRecord(team, "surface", sprint.id, { ...surface, state: "archive_pending" }, now);
      const final = yield* readRecord<Operation>(team, "outbox", operationId(key));
      const finalLogged = final?.resultId ? yield* readRecord(team, "message", final.resultId) : null;
      if (surface.logCaughtUp && final?.state === "sent" && finalLogged) {
        yield* enqueue(team, `sprint-archive:${team}:${sprint.id}`, { kind: "archive", sprintId: sprint.id, channelId }, now);
      }
      return;
    }
    const clock = localClock(now, connection.timezone);
    if (sprint.status === "active" && clock.time >= connection.dailyAt) {
      yield* enqueue(team, `sprint-daily:${team}:${sprint.id}:${clock.date}:${connection.platform}:${surface.channelId}`, {
        kind: "message", channelId, text: sprintSummary(view, webUrl, `${clock.date} 朝のスプリントサマリ (${connection.timezone})`),
      }, now);
    }
  });
}
