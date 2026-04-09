/**
 * WS Command Handlers — Voting module
 */

import { v4 as uuidv4 } from "uuid";
import { registerCommand } from "../dispatcher.js";
import {
  votingEventRepo,
  votingCandidateRepo,
  voteRepo,
  userRepo,
} from "../../db/repository.js";
import { generateAutoReply } from "../../../modules/voting/auto-reply.js";
import type { VoteAnswer } from "../../shared/constants.js";
import { logActivity } from "../../activity-logger.js";
import { notifyUser } from "../broadcast.js";

// ── voting.create_event ──

interface CreateVotingEventPayload {
  title: string;
  description?: string;
  deadline?: string;
  candidates: string[];
}

registerCommand("voting", "create_event", async (userId, payload) => {
  const body = payload as CreateVotingEventPayload;

  if (!body.title || !body.candidates?.length) {
    throw new Error("title and candidates are required");
  }

  const eventId = uuidv4();
  await votingEventRepo.create({
    id: eventId,
    title: body.title,
    description: body.description || "",
    createdBy: userId,
    deadline: body.deadline || null,
    status: "open",
  });

  const candidateRows = body.candidates.map((label, i) => ({
    id: uuidv4(),
    eventId,
    label,
    sortOrder: i,
  }));

  for (const row of candidateRows) {
    await votingCandidateRepo.create(row);
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "投票イベント作成", `投票イベント「${body.title}」が追加されました`);

  return {
    id: eventId,
    title: body.title,
    candidates: candidateRows,
  };
});

// ── voting.submit_votes ──

interface SubmitVotesPayload {
  eventId: string;
  votes: { candidateId: string; answer: VoteAnswer; comment?: string }[];
}

registerCommand("voting", "submit_votes", async (userId, payload) => {
  const body = payload as SubmitVotesPayload;
  if (!body.eventId) throw new Error("eventId is required");

  const event = await votingEventRepo.findById(body.eventId);
  if (!event) throw new Error("Event not found");
  if (event.status !== "open") throw new Error("Event is closed");

  if (event.deadline) {
    const deadline = new Date(event.deadline);
    if (new Date() > deadline) {
      throw new Error("Voting deadline has passed");
    }
  }

  const saved: Array<Record<string, unknown>> = [];
  for (const v of body.votes) {
    const existing = await voteRepo.findExisting(body.eventId, v.candidateId, userId);

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
        eventId: body.eventId,
        candidateId: v.candidateId,
        userId,
        answer: v.answer,
        isAutoReply: false,
        comment: v.comment || "",
      });
      saved.push({ id: voteId, ...v, userId });
    }
  }

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "投票回答", `投票イベント(${body.eventId})に回答しました`);

  // イベント作成者に投票通知
  if (event.createdBy !== userId) {
    notifyUser(event.createdBy, "voting.vote_submitted", {
      eventId: body.eventId,
      eventTitle: event.title,
      voterName: user?.name || "Unknown",
      voteCount: saved.length,
    });
  }

  return { votes: saved };
});

// ── voting.auto_reply ──

interface AutoReplyPayload {
  eventId: string;
}

registerCommand("voting", "auto_reply", async (userId, payload) => {
  const body = payload as AutoReplyPayload;
  if (!body.eventId) throw new Error("eventId is required");

  const event = await votingEventRepo.findById(body.eventId);
  if (!event) throw new Error("Event not found");
  if (event.status !== "open") throw new Error("Event is closed");

  const candidates = await votingCandidateRepo.findByEventId(body.eventId);

  const autoVotes: Array<{ candidateId: string; label: string; answer: string }> = [];
  const skipped: string[] = [];

  for (const cand of candidates) {
    const answer = await generateAutoReply(userId, cand.label);

    if (answer === null) {
      skipped.push(cand.id);
      continue;
    }

    const existing = await voteRepo.findExisting(body.eventId, cand.id, userId);

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
        eventId: body.eventId,
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
});

// ── voting.update_event ──

interface UpdateVotingEventPayload {
  eventId: string;
  status?: string;
  title?: string;
  description?: string;
  deadline?: string;
}

registerCommand("voting", "update_event", async (userId, payload) => {
  const body = payload as UpdateVotingEventPayload;
  if (!body.eventId) throw new Error("eventId is required");

  const event = await votingEventRepo.findById(body.eventId);
  if (!event) throw new Error("Event not found");
  if (event.createdBy !== userId) {
    throw new Error("Only the creator can update this event");
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.status) updates.status = body.status;
  if (body.title) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.deadline !== undefined) updates.deadline = body.deadline;

  await votingEventRepo.update(body.eventId, updates);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "投票イベント更新", `投票イベント「${event.title}」が更新されました`);

  // ステータス変更時（closed など）は投票参加者に通知
  if (body.status) {
    const allVotes = await voteRepo.findByEventId(body.eventId);
    const voterIds = new Set<string>();
    for (const v of allVotes) {
      if (v.userId !== userId) voterIds.add(v.userId);
    }
    for (const voterId of voterIds) {
      notifyUser(voterId, "voting.event_updated", {
        eventId: body.eventId,
        title: event.title,
        status: body.status,
      });
    }
  }

  return { message: "Updated", eventId: body.eventId };
});

// ── voting.delete_event ──

interface DeleteVotingEventPayload {
  eventId: string;
}

registerCommand("voting", "delete_event", async (userId, payload) => {
  const body = payload as DeleteVotingEventPayload;
  if (!body.eventId) throw new Error("eventId is required");

  const event = await votingEventRepo.findById(body.eventId);
  if (!event) throw new Error("Event not found");
  if (event.createdBy !== userId) {
    throw new Error("Only the creator can delete this event");
  }

  await voteRepo.deleteByEventId(body.eventId);
  await votingCandidateRepo.deleteByEventId(body.eventId);
  await votingEventRepo.deleteById(body.eventId);

  return { message: "Deleted", eventId: body.eventId };
});
