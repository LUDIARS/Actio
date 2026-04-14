/**
 * Voting module — WS command handlers
 *
 * SDK `wsCommands` フィールド経由で dispatcher に登録される。
 * module = "voting", action = ハンドラのキー。
 */

import { v4 as uuidv4 } from "uuid";
import type { WsCommandHandler } from "@ludiars/schedula-sdk";
import {
  votingEventRepo,
  votingCandidateRepo,
  voteRepo,
} from "../../src/db/repository.js";
import { generateAutoReply } from "./auto-reply.js";
import type { VoteAnswer } from "../../src/shared/constants.js";
import { notifyUser } from "../../src/ws/broadcast.js";

// ── voting.create_event ──

interface CreateVotingEventPayload {
  title: string;
  description?: string;
  deadline?: string;
  candidates: string[];
}

const createEvent: WsCommandHandler<CreateVotingEventPayload> = async (userId, payload, ctx) => {
  if (!payload.title || !payload.candidates?.length) {
    throw new Error("title and candidates are required");
  }

  const eventId = uuidv4();
  await votingEventRepo.create({
    id: eventId,
    title: payload.title,
    description: payload.description || "",
    createdBy: userId,
    deadline: payload.deadline || null,
    status: "open",
  });

  const candidateRows = payload.candidates.map((label, i) => ({
    id: uuidv4(),
    eventId,
    label,
    sortOrder: i,
  }));

  for (const row of candidateRows) {
    await votingCandidateRepo.create(row);
  }

  const user = await ctx.users.get(userId);
  ctx.audit(userId, "投票イベント作成", `投票イベント「${payload.title}」が追加されました (user: ${user.name})`);

  return { id: eventId, title: payload.title, candidates: candidateRows };
};

// ── voting.submit_votes ──

interface SubmitVotesPayload {
  eventId: string;
  votes: { candidateId: string; answer: VoteAnswer; comment?: string }[];
}

const submitVotes: WsCommandHandler<SubmitVotesPayload> = async (userId, payload, ctx) => {
  if (!payload.eventId) throw new Error("eventId is required");

  const event = await votingEventRepo.findById(payload.eventId);
  if (!event) throw new Error("Event not found");
  if (event.status !== "open") throw new Error("Event is closed");

  if (event.deadline) {
    const deadline = new Date(event.deadline);
    if (new Date() > deadline) throw new Error("Voting deadline has passed");
  }

  const saved: Array<Record<string, unknown>> = [];
  for (const v of payload.votes) {
    const existing = await voteRepo.findExisting(payload.eventId, v.candidateId, userId);

    if (existing) {
      await voteRepo.update(existing.id, {
        answer: v.answer,
        comment: v.comment || "",
        isAutoReply: false,
        updatedAt: new Date(),
      });
      saved.push({ ...existing, answer: v.answer, comment: v.comment || "" });
    } else {
      const voteId = uuidv4();
      await voteRepo.create({
        id: voteId,
        eventId: payload.eventId,
        candidateId: v.candidateId,
        userId,
        answer: v.answer,
        isAutoReply: false,
        comment: v.comment || "",
      });
      saved.push({ id: voteId, ...v, userId });
    }
  }

  const user = await ctx.users.get(userId);
  ctx.audit(userId, "投票回答", `投票イベント(${payload.eventId})に回答しました (user: ${user.name})`);

  // イベント作成者に投票通知
  if (event.createdBy !== userId) {
    notifyUser(event.createdBy, "voting.vote_submitted", {
      eventId: payload.eventId,
      eventTitle: event.title,
      voterName: user.name || "Unknown",
      voteCount: saved.length,
    });
  }

  return { votes: saved };
};

// ── voting.auto_reply ──

interface AutoReplyPayload {
  eventId: string;
}

const autoReply: WsCommandHandler<AutoReplyPayload> = async (userId, payload) => {
  if (!payload.eventId) throw new Error("eventId is required");

  const event = await votingEventRepo.findById(payload.eventId);
  if (!event) throw new Error("Event not found");
  if (event.status !== "open") throw new Error("Event is closed");

  const candidates = await votingCandidateRepo.findByEventId(payload.eventId);

  const autoVotes: Array<{ candidateId: string; label: string; answer: string }> = [];
  const skipped: string[] = [];

  for (const cand of candidates) {
    const answer = await generateAutoReply(userId, cand.label);

    if (answer === null) {
      skipped.push(cand.id);
      continue;
    }

    const existing = await voteRepo.findExisting(payload.eventId, cand.id, userId);
    if (existing) {
      await voteRepo.update(existing.id, {
        answer,
        isAutoReply: true,
        comment: "自動回答",
        updatedAt: new Date(),
      });
    } else {
      const voteId = uuidv4();
      await voteRepo.create({
        id: voteId,
        eventId: payload.eventId,
        candidateId: cand.id,
        userId,
        answer,
        isAutoReply: true,
        comment: "自動回答",
      });
    }

    autoVotes.push({ candidateId: cand.id, label: cand.label, answer });
  }

  return {
    autoVotes,
    skipped,
    message: skipped.length > 0
      ? `${autoVotes.length}件を自動回答、${skipped.length}件は解析不能のためスキップ`
      : `${autoVotes.length}件すべて自動回答しました`,
  };
};

// ── voting.update_event ──

interface UpdateVotingEventPayload {
  eventId: string;
  status?: string;
  title?: string;
  description?: string;
  deadline?: string;
}

const updateEvent: WsCommandHandler<UpdateVotingEventPayload> = async (userId, payload, ctx) => {
  if (!payload.eventId) throw new Error("eventId is required");

  const event = await votingEventRepo.findById(payload.eventId);
  if (!event) throw new Error("Event not found");
  if (event.createdBy !== userId) throw new Error("Only the creator can update this event");

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (payload.status) updates.status = payload.status;
  if (payload.title) updates.title = payload.title;
  if (payload.description !== undefined) updates.description = payload.description;
  if (payload.deadline !== undefined) updates.deadline = payload.deadline;

  await votingEventRepo.update(payload.eventId, updates);

  const user = await ctx.users.get(userId);
  ctx.audit(userId, "投票イベント更新", `投票イベント「${event.title}」が更新されました (user: ${user.name})`);

  // ステータス変更時は投票参加者に通知
  if (payload.status) {
    const allVotes = await voteRepo.findByEventId(payload.eventId);
    const voterIds = new Set<string>();
    for (const v of allVotes) {
      if (v.userId !== userId) voterIds.add(v.userId);
    }
    for (const voterId of voterIds) {
      notifyUser(voterId, "voting.event_updated", {
        eventId: payload.eventId,
        title: event.title,
        status: payload.status,
      });
    }
  }

  return { message: "Updated", eventId: payload.eventId };
};

// ── voting.delete_event ──

interface DeleteVotingEventPayload {
  eventId: string;
}

const deleteEvent: WsCommandHandler<DeleteVotingEventPayload> = async (userId, payload) => {
  if (!payload.eventId) throw new Error("eventId is required");

  const event = await votingEventRepo.findById(payload.eventId);
  if (!event) throw new Error("Event not found");
  if (event.createdBy !== userId) throw new Error("Only the creator can delete this event");

  await voteRepo.deleteByEventId(payload.eventId);
  await votingCandidateRepo.deleteByEventId(payload.eventId);
  await votingEventRepo.deleteById(payload.eventId);

  return { message: "Deleted", eventId: payload.eventId };
};

export const wsCommands: Record<string, WsCommandHandler> = {
  create_event: createEvent as WsCommandHandler,
  submit_votes: submitVotes as WsCommandHandler,
  auto_reply: autoReply as WsCommandHandler,
  update_event: updateEvent as WsCommandHandler,
  delete_event: deleteEvent as WsCommandHandler,
};
