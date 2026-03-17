import { Hono } from "hono";
import { v4 as uuidv4 } from "uuid";
import { getUserId } from "../../src/middleware/getUserId.js";
import {
  schedulingTaskRepo,
  schedulingResultRepo,
  groupMemberRepo,
  groupRepo,
  groupScheduleRepo,
  personalEventRepo,
} from "../../src/db/repository.js";
import { solve, type TaskInput } from "./solver.js";
import { calculateGroupAvailability } from "../auto-scheduler/availability.js";
import { DAYS_COUNT, PERIODS_COUNT } from "../../src/shared/constants.js";
import type { UnifiedSlot, AvailabilitySlot } from "../../src/shared/types.js";

const smartScheduler = new Hono();

// ─── Helper: ユーザーがグループメンバーか確認 ─────────────────

async function verifyGroupMember(userId: string, groupId: string): Promise<boolean> {
  const memberships = await groupMemberRepo.findByUserId(userId);
  return memberships.some((m) => m.groupId === groupId);
}

// ─── Helper: グループの空き状況を取得 ────────────────────────

async function getGroupAvailability(groupId: string): Promise<{
  availability: AvailabilitySlot[];
  totalMembers: number;
}> {
  const memberships = await groupMemberRepo.findByGroupId(groupId);
  const memberUserIds = memberships.map((m) => m.userId);

  if (memberUserIds.length === 0) {
    return { availability: [], totalMembers: 0 };
  }

  // 各メンバーのスロットマトリクスを構築
  const memberSlots: { userId: string; slots: UnifiedSlot[][] }[] = [];

  for (const uid of memberUserIds) {
    // 7×11の空きマトリクス (デフォルトfree)
    const slots: UnifiedSlot[][] = Array.from({ length: DAYS_COUNT }, (_, day) =>
      Array.from({ length: PERIODS_COUNT }, (_, period) => ({
        day,
        period,
        status: "free" as const,
        majorLabel: null,
        isPrivate: false,
        sourceModule: "smart-scheduler",
      }))
    );

    // 個人イベントでbusy化
    const events = await personalEventRepo.findByUserId(uid);
    for (const ev of events) {
      for (let p = ev.period; p < ev.period + ev.duration && p < PERIODS_COUNT; p++) {
        if (ev.day >= 0 && ev.day < DAYS_COUNT) {
          slots[ev.day][p] = {
            ...slots[ev.day][p],
            status: "personal",
          };
        }
      }
    }

    // グループスケジュールでbusy化
    const groupScheds = await groupScheduleRepo.findByGroupId(groupId);
    for (const gs of groupScheds) {
      for (let p = gs.period; p < gs.period + gs.duration && p < PERIODS_COUNT; p++) {
        if (gs.day >= 0 && gs.day < DAYS_COUNT) {
          slots[gs.day][p] = {
            ...slots[gs.day][p],
            status: "reserved",
          };
        }
      }
    }

    memberSlots.push({ userId: uid, slots });
  }

  const emptyRoomMap = new Map<string, string[]>();
  const availability = calculateGroupAvailability(memberSlots, emptyRoomMap);

  return { availability, totalMembers: memberUserIds.length };
}

// ─── GET /tasks/:groupId - タスク一覧 ───────────────────────

smartScheduler.get("/tasks/:groupId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("groupId");
  if (!(await verifyGroupMember(userId, groupId))) {
    return c.json({ error: "Not a group member" }, 403);
  }

  const tasks = await schedulingTaskRepo.findByGroupId(groupId);
  return c.json({ tasks });
});

// ─── POST /tasks - タスク追加 ────────────────────────────────

smartScheduler.post("/tasks", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    groupId: string;
    title: string;
    duration?: number;
    priority?: number;
    preferredDays?: number[];
    preferredPeriods?: number[];
  }>();

  if (!body.groupId || !body.title) {
    return c.json({ error: "groupId and title are required" }, 400);
  }

  if (!(await verifyGroupMember(userId, body.groupId))) {
    return c.json({ error: "Not a group member" }, 403);
  }

  const now = new Date();
  const task = {
    id: uuidv4(),
    groupId: body.groupId,
    title: body.title,
    duration: body.duration || 1,
    priority: body.priority || 0,
    preferredDays: body.preferredDays || [],
    preferredPeriods: body.preferredPeriods || [],
    status: "pending",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };

  await schedulingTaskRepo.create(task);
  return c.json({ task }, 201);
});

// ─── PUT /tasks/:id - タスク更新 ────────────────────────────

smartScheduler.put("/tasks/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const taskId = c.req.param("id");
  const existing = await schedulingTaskRepo.findById(taskId);
  if (!existing) return c.json({ error: "Task not found" }, 404);

  if (!(await verifyGroupMember(userId, existing.groupId))) {
    return c.json({ error: "Not a group member" }, 403);
  }

  const body = await c.req.json<{
    title?: string;
    duration?: number;
    priority?: number;
    preferredDays?: number[];
    preferredPeriods?: number[];
  }>();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.preferredDays !== undefined) updates.preferredDays = body.preferredDays;
  if (body.preferredPeriods !== undefined) updates.preferredPeriods = body.preferredPeriods;

  await schedulingTaskRepo.update(taskId, updates);
  const updated = await schedulingTaskRepo.findById(taskId);
  return c.json({ task: updated });
});

// ─── DELETE /tasks/:id - タスク削除 ──────────────────────────

smartScheduler.delete("/tasks/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const taskId = c.req.param("id");
  const existing = await schedulingTaskRepo.findById(taskId);
  if (!existing) return c.json({ error: "Task not found" }, 404);

  if (!(await verifyGroupMember(userId, existing.groupId))) {
    return c.json({ error: "Not a group member" }, 403);
  }

  await schedulingTaskRepo.deleteById(taskId);
  return c.json({ message: "Task deleted" });
});

// ─── POST /solve/:groupId - 自動配置実行 ────────────────────

smartScheduler.post("/solve/:groupId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("groupId");
  if (!(await verifyGroupMember(userId, groupId))) {
    return c.json({ error: "Not a group member" }, 403);
  }

  // 未配置タスクを取得
  const pendingTasks = await schedulingTaskRepo.findPendingByGroupId(groupId);
  if (pendingTasks.length === 0) {
    return c.json({ error: "No pending tasks to schedule" }, 400);
  }

  // グループの空き状況を取得
  const { availability, totalMembers } = await getGroupAvailability(groupId);
  if (totalMembers === 0) {
    return c.json({ error: "Group has no members" }, 400);
  }

  // DPソルバー実行
  const taskInputs: TaskInput[] = pendingTasks.map((t) => ({
    id: t.id,
    title: t.title,
    duration: t.duration,
    priority: t.priority,
    preferredDays: (t.preferredDays as number[]) || [],
    preferredPeriods: (t.preferredPeriods as number[]) || [],
  }));

  const solveResult = solve(taskInputs, availability, totalMembers);

  // 結果をDBに保存
  const resultId = uuidv4();
  await schedulingResultRepo.create({
    id: resultId,
    groupId,
    status: "draft",
    placements: solveResult.placements,
    totalScore: solveResult.totalScore,
    createdBy: userId,
    createdAt: new Date(),
  });

  return c.json({
    resultId,
    placements: solveResult.placements,
    totalScore: solveResult.totalScore,
    unplacedTaskIds: solveResult.unplacedTaskIds,
    totalMembers,
  });
});

// ─── POST /confirm/:resultId - 配置結果を確定 ───────────────

smartScheduler.post("/confirm/:resultId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const resultId = c.req.param("resultId");
  const result = await schedulingResultRepo.findById(resultId);
  if (!result) return c.json({ error: "Result not found" }, 404);

  if (result.status !== "draft") {
    return c.json({ error: "Result is not in draft status" }, 400);
  }

  if (!(await verifyGroupMember(userId, result.groupId))) {
    return c.json({ error: "Not a group member" }, 403);
  }

  // 配置結果をグループスケジュールとして登録
  // (personalEventsではなくgroupSchedulesに入れる)
  const placements = result.placements as Array<{
    taskId: string; title: string; day: number; period: number; duration: number; score: number;
  }>;

  for (const p of placements) {
    // タスクのステータスを更新
    await schedulingTaskRepo.update(p.taskId, { status: "placed", updatedAt: new Date() });
  }

  // 結果ステータスを確定に
  await schedulingResultRepo.update(resultId, { status: "confirmed" });

  return c.json({ message: "Schedule confirmed", placements });
});

// ─── GET /results/:groupId - 配置結果一覧 ───────────────────

smartScheduler.get("/results/:groupId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("groupId");
  if (!(await verifyGroupMember(userId, groupId))) {
    return c.json({ error: "Not a group member" }, 403);
  }

  const results = await schedulingResultRepo.findByGroupId(groupId);
  return c.json({ results });
});

// ─── GET /availability/:groupId - 空き状況プレビュー ────────

smartScheduler.get("/availability/:groupId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const groupId = c.req.param("groupId");
  if (!(await verifyGroupMember(userId, groupId))) {
    return c.json({ error: "Not a group member" }, 403);
  }

  const { availability, totalMembers } = await getGroupAvailability(groupId);
  return c.json({ availability, totalMembers });
});

export { smartScheduler };
