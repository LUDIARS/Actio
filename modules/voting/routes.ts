import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { db, schema } from "../../src/db/connection.js";
import { eq, and, inArray } from "drizzle-orm";
import { generateAutoReply } from "./auto-reply.js";
import type { VoteAnswer } from "../../src/shared/constants.js";
import { getUserId } from "../../src/middleware/getUserId.js";

const m6 = new Hono();

// ─── POST /events — イベント作成 ─────────────────────────────
m6.post("/events", async (c) => {
  const userId = getUserId(c) || "";
  const body = await c.req.json<{
    title: string;
    description?: string;
    deadline?: string;
    candidates: string[];
  }>();

  if (!body.title || !body.candidates?.length) {
    return c.json({ error: "title and candidates are required" }, 400);
  }

  const eventId = uuidv4();
  db.insert(schema.votingEvents)
    .values({
      id: eventId,
      title: body.title,
      description: body.description || "",
      createdBy: userId,
      deadline: body.deadline || null,
      status: "open",
    })
    .run();

  const candidateRows = body.candidates.map((label, i) => ({
    id: uuidv4(),
    eventId,
    label,
    sortOrder: i,
  }));

  for (const row of candidateRows) {
    db.insert(schema.votingCandidates).values(row).run();
  }

  return c.json({
    id: eventId,
    title: body.title,
    candidates: candidateRows,
  }, 201);
});

// ─── GET /events — イベント一覧 ──────────────────────────────
m6.get("/events", async (c) => {
  const events = db
    .select()
    .from(schema.votingEvents)
    .orderBy(schema.votingEvents.createdAt)
    .all();

  // 各イベントの候補を取得
  const result = events.map((e: any) => {
    const candidates = db
      .select()
      .from(schema.votingCandidates)
      .where(eq(schema.votingCandidates.eventId, e.id))
      .orderBy(schema.votingCandidates.sortOrder)
      .all();

    return { ...e, candidates };
  });

  return c.json({ events: result });
});

// ─── GET /events/:eventId — イベント詳細 + 集計 ─────────────
m6.get("/events/:eventId", async (c) => {
  const eventId = c.req.param("eventId");

  const [event] = db
    .select()
    .from(schema.votingEvents)
    .where(eq(schema.votingEvents.id, eventId))
    .limit(1)
    .all();

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }

  const candidates = db
    .select()
    .from(schema.votingCandidates)
    .where(eq(schema.votingCandidates.eventId, eventId))
    .orderBy(schema.votingCandidates.sortOrder)
    .all();

  const allVotes = db
    .select()
    .from(schema.votes)
    .where(eq(schema.votes.eventId, eventId))
    .all();

  // 集計
  const summary: Record<string, { ok: number; maybe: number; ng: number }> = {};
  for (const cand of candidates) {
    summary[cand.id] = { ok: 0, maybe: 0, ng: 0 };
  }

  const responses: Record<string, Record<string, any>> = {};
  const userIds = new Set<string>();

  for (const vote of allVotes) {
    const v = vote as any;
    userIds.add(v.userId);

    if (summary[v.candidateId]) {
      if (v.answer === "ok") summary[v.candidateId].ok++;
      else if (v.answer === "maybe") summary[v.candidateId].maybe++;
      else if (v.answer === "ng") summary[v.candidateId].ng++;
    }

    if (!responses[v.userId]) responses[v.userId] = {};
    responses[v.userId][v.candidateId] = v;
  }

  // ユーザー名を取得
  const respondents: Record<string, string> = {};
  if (userIds.size > 0) {
    const users = db
      .select({ id: schema.users.id, name: schema.users.name })
      .from(schema.users)
      .where(inArray(schema.users.id, Array.from(userIds)))
      .all();

    for (const u of users) {
      respondents[u.id] = u.name;
    }
  }

  return c.json({
    event: { ...event, candidates },
    summary,
    responses,
    respondents,
  });
});

// ─── POST /events/:eventId/votes — 回答を送信 ───────────────
m6.post("/events/:eventId/votes", async (c) => {
  const eventId = c.req.param("eventId");
  const userId = getUserId(c) || "";
  const body = await c.req.json<{
    votes: { candidateId: string; answer: VoteAnswer; comment?: string }[];
  }>();

  // イベント存在・open確認
  const [event] = db
    .select()
    .from(schema.votingEvents)
    .where(eq(schema.votingEvents.id, eventId))
    .limit(1)
    .all();

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }
  if ((event as any).status !== "open") {
    return c.json({ error: "Event is closed" }, 400);
  }

  // 期限チェック
  if ((event as any).deadline) {
    const deadline = new Date((event as any).deadline);
    if (new Date() > deadline) {
      return c.json({ error: "Voting deadline has passed" }, 400);
    }
  }

  const saved: any[] = [];
  for (const v of body.votes) {
    // upsert: 既存回答があれば更新、なければ挿入
    const [existing] = db
      .select()
      .from(schema.votes)
      .where(
        and(
          eq(schema.votes.eventId, eventId),
          eq(schema.votes.candidateId, v.candidateId),
          eq(schema.votes.userId, userId)
        )
      )
      .limit(1)
      .all();

    if (existing) {
      db.update(schema.votes)
        .set({
          answer: v.answer,
          comment: v.comment || "",
          isAutoReply: false,
          updatedAt: new Date(),
        })
        .where(eq(schema.votes.id, (existing as any).id))
        .run();
      saved.push({ ...existing, answer: v.answer, comment: v.comment || "" });
    } else {
      const voteId = uuidv4();
      db.insert(schema.votes)
        .values({
          id: voteId,
          eventId,
          candidateId: v.candidateId,
          userId,
          answer: v.answer,
          isAutoReply: false,
          comment: v.comment || "",
        })
        .run();
      saved.push({ id: voteId, ...v, userId });
    }
  }

  return c.json({ votes: saved });
});

// ─── POST /events/:eventId/auto-reply — 自動回答 ────────────
m6.post("/events/:eventId/auto-reply", async (c) => {
  const eventId = c.req.param("eventId");
  const userId = getUserId(c) || "";

  const [event] = db
    .select()
    .from(schema.votingEvents)
    .where(eq(schema.votingEvents.id, eventId))
    .limit(1)
    .all();

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }
  if ((event as any).status !== "open") {
    return c.json({ error: "Event is closed" }, 400);
  }

  const candidates = db
    .select()
    .from(schema.votingCandidates)
    .where(eq(schema.votingCandidates.eventId, eventId))
    .orderBy(schema.votingCandidates.sortOrder)
    .all();

  const autoVotes: any[] = [];
  const skipped: string[] = [];

  for (const cand of candidates) {
    const answer = await generateAutoReply(userId, (cand as any).label);

    if (answer === null) {
      skipped.push((cand as any).id);
      continue;
    }

    // upsert
    const [existing] = db
      .select()
      .from(schema.votes)
      .where(
        and(
          eq(schema.votes.eventId, eventId),
          eq(schema.votes.candidateId, (cand as any).id),
          eq(schema.votes.userId, userId)
        )
      )
      .limit(1)
      .all();

    if (existing) {
      db.update(schema.votes)
        .set({
          answer,
          isAutoReply: true,
          comment: "自動回答",
          updatedAt: new Date(),
        })
        .where(eq(schema.votes.id, (existing as any).id))
        .run();
    } else {
      const voteId = uuidv4();
      db.insert(schema.votes)
        .values({
          id: voteId,
          eventId,
          candidateId: (cand as any).id,
          userId,
          answer,
          isAutoReply: true,
          comment: "自動回答",
        })
        .run();
    }

    autoVotes.push({ candidateId: (cand as any).id, label: (cand as any).label, answer });
  }

  return c.json({
    autoVotes,
    skipped,
    message: skipped.length > 0
      ? `${autoVotes.length}件を自動回答、${skipped.length}件は解析不能のためスキップ`
      : `${autoVotes.length}件すべて自動回答しました`,
  });
});

// ─── PUT /events/:eventId — イベント更新 (close等) ──────────
m6.put("/events/:eventId", async (c) => {
  const eventId = c.req.param("eventId");
  const userId = getUserId(c) || "";
  const body = await c.req.json<{
    status?: string;
    title?: string;
    description?: string;
    deadline?: string;
  }>();

  const [event] = db
    .select()
    .from(schema.votingEvents)
    .where(eq(schema.votingEvents.id, eventId))
    .limit(1)
    .all();

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }
  if ((event as any).createdBy !== userId) {
    return c.json({ error: "Only the creator can update this event" }, 403);
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (body.status) updates.status = body.status;
  if (body.title) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.deadline !== undefined) updates.deadline = body.deadline;

  db.update(schema.votingEvents)
    .set(updates)
    .where(eq(schema.votingEvents.id, eventId))
    .run();

  return c.json({ message: "Updated", eventId });
});

// ─── DELETE /events/:eventId — イベント削除 ──────────────────
m6.delete("/events/:eventId", async (c) => {
  const eventId = c.req.param("eventId");
  const userId = getUserId(c) || "";

  const [event] = db
    .select()
    .from(schema.votingEvents)
    .where(eq(schema.votingEvents.id, eventId))
    .limit(1)
    .all();

  if (!event) {
    return c.json({ error: "Event not found" }, 404);
  }
  if ((event as any).createdBy !== userId) {
    return c.json({ error: "Only the creator can delete this event" }, 403);
  }

  // 関連データを削除 (votes → candidates → event)
  db.delete(schema.votes).where(eq(schema.votes.eventId, eventId)).run();
  db.delete(schema.votingCandidates).where(eq(schema.votingCandidates.eventId, eventId)).run();
  db.delete(schema.votingEvents).where(eq(schema.votingEvents.id, eventId)).run();

  return c.json({ message: "Deleted", eventId });
});

export { m6 };
