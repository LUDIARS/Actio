// @implements AT-SPRINT-CHAT-INTEGRATION
import type { SprintGateStore } from "../sprint-gates/store.js";
import { all } from "../sprint-gates/query.js";
import { ChatRecords } from "./records.js";
import { IntakeStore } from "./intake-store.js";
import { ChatOutbox } from "./outbox.js";
import type { IntakeReviewer } from "./reviewer.js";
import type { Connection, Intake, Surface, Transport } from "./contracts.js";
import { considerDiscussion, type DiscussionSetting } from "./discussion.js";
import { ingestChannel } from "./ingestion.js";
import { publishSprint } from "./sprint-publication.js";
import { localClock } from "./summary.js";
import { deliverPending } from "./delivery.js";

export async function runChatConnection(records: ChatRecords, connection: Connection,
  transport: Transport, reviewer: IntakeReviewer, gates: SprintGateStore, webUrl: string,
  now: () => Date, signal: AbortSignal, ownsLease: () => Promise<boolean>): Promise<void> {
  await transport.validate(connection);
  const surfacesBefore = (await records.allOfKind<Surface>("surface")).filter(s => s.teamId === connection.teamId);
  const candidates = (await gates.candidates()).filter(s => s.teamId === connection.teamId);
  for (const surface of surfacesBefore) if (surface.state !== "archived" && !candidates.some(s => s.id === surface.sprintId)) candidates.push({ teamId: connection.teamId, id: surface.sprintId });
  let active = false;
  for (const sprint of candidates) {
    const view = await gates.view(connection.teamId, sprint.id, now());
    active ||= view.sprint.status === "active";
    await publishSprint(records, connection, view, now(), webUrl);
  }
  const clock = localClock(now(), connection.timezone);
  if (!active && clock.time >= connection.dailyAt) await new ChatOutbox(records).enqueue(connection.teamId,
    `no-active:${connection.teamId}:${clock.date}`, { kind: "message", channelId: connection.backlogChannelId,
      text: `${clock.date}: 活動中のスプリントはありません。目標・タスク・期日を計画してください。\n${webUrl}/tasks/planning?teamId=${encodeURIComponent(connection.teamId)}` }, now());
  const surfaces = (await records.allOfKind<Surface>("surface")).filter(s => s.teamId === connection.teamId);
  const roots = [connection.backlogChannelId, ...surfaces.flatMap(s => s.channelId ? [s.channelId] : [])];
  for (const root of roots) {
    if (signal.aborted || !await ownsLease()) return;
    const threads = await transport.threads(connection, root);
    let complete = true;
    for (const channel of [root, ...threads]) {
      if (signal.aborted || !await ownsLease()) return;
      await records.save(connection.teamId, "channel", channel, { id: channel, parentId: channel === root ? null : root }, now());
      const caughtUp = await ingestChannel(records, connection, transport, channel, now());
      complete &&= caughtUp;
      const setting = await records.get<DiscussionSetting>(connection.teamId, "discussion-setting", channel);
      if (caughtUp && setting?.enabled && !surfaces.some(s => s.channelId === root && s.state !== "active")) {
        try {
          await considerDiscussion(records, connection, setting, now(), signal);
          await records.save(connection.teamId, "discussion-health", channel, { error: null, at: now().toISOString() }, now());
        } catch {
          await records.save(connection.teamId, "discussion-health", channel, { error: "Diの議論参加を利用できません。接続・資格情報・Diの稼働状態を確認してください", at: now().toISOString() }, now());
        }
      }
    }
    const surface = surfaces.find(s => s.channelId === root);
    if (surface) await records.save(connection.teamId, "surface", surface.sprintId, { ...surface, logCaughtUp: complete }, now());
  }
  const intakes = (await records.allOfKind<Intake>("intake")).filter(i => i.teamId === connection.teamId && i.state === "checking" && i.threadId);
  const titles = await records.transaction(connection.teamId, function* () {
    return (yield* all<{ title: string }>("SELECT title FROM tasks WHERE team_id=? AND lane='backlog' LIMIT 100", connection.teamId)).map(t => t.title);
  });
  for (const intake of intakes) {
    if (signal.aborted || !await ownsLease()) return;
    try { await new IntakeStore(records).review(connection.teamId, intake.id, intake.revision, await reviewer.review(intake.content, titles, signal), null, now()); }
    catch { await new IntakeStore(records).review(connection.teamId, intake.id, intake.revision, null, "内容審査を利用できません。人間による内容確認が必要です", now()); }
  }
  await deliverPending(records, connection, transport, now, ownsLease);
}
