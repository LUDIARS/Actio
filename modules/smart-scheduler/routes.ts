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
  availableSlotRepo,
  userRepo,
} from "../../src/db/repository.js";
import { logActivity } from "../../src/activity-logger.js";
import { solve, type TaskInput } from "./solver.js";
import { calculateGroupAvailability } from "./availability.js";
import { DAYS_COUNT, PERIODS_COUNT } from "../../src/shared/constants.js";
import type { UnifiedSlot, AvailabilitySlot } from "../../src/shared/types.js";

const smartScheduler = new Hono();

// ─── Helper: ユーザーがグループメンバーか確認 ─────────────────

async function verifyGroupMember(userId: string, groupId: string): Promise<boolean> {
  const memberships = await groupMemberRepo.findByUserId(userId);
  return memberships.some((m: { groupId: string }) => m.groupId === groupId);
}

// ─── Helper: グループの空き状況を取得 ────────────────────────

async function getGroupAvailability(groupId: string): Promise<{
  availability: AvailabilitySlot[];
  totalMembers: number;
}> {
  const memberships = await groupMemberRepo.findByGroupId(groupId);
  const memberUserIds = memberships.map((m: { userId: string }) => m.userId);

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
    instructorId?: string;
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
    instructorId: body.instructorId || null,
    status: "pending",
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  };

  await schedulingTaskRepo.create(task);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "スケジュールタスク作成", `タスク「${body.title}」が追加されました`);

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
    instructorId?: string | null;
  }>();

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.duration !== undefined) updates.duration = body.duration;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.preferredDays !== undefined) updates.preferredDays = body.preferredDays;
  if (body.preferredPeriods !== undefined) updates.preferredPeriods = body.preferredPeriods;
  if (body.instructorId !== undefined) updates.instructorId = body.instructorId;

  await schedulingTaskRepo.update(taskId, updates);
  const updated = await schedulingTaskRepo.findById(taskId);

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "スケジュールタスク更新", `タスク「${updated?.title || taskId}」が更新されました`);

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

  // 講師の空き時間を取得し、講師が設定されたタスクの候補スロットを制限する
  const instructorAvailMap = new Map<string, Set<string>>();
  const instructorIds = [...new Set(
    pendingTasks.map((t) => t.instructorId).filter((id): id is string => !!id)
  )];
  for (const instrId of instructorIds) {
    const slots = await availableSlotRepo.findByInstructor(instrId);
    const slotKeys = new Set<string>();
    for (const slot of slots) {
      const periods = (typeof slot.periods === "string" ? JSON.parse(slot.periods) : slot.periods) as number[];
      for (const p of periods) {
        slotKeys.add(`${slot.day}-${p}`);
      }
    }
    instructorAvailMap.set(instrId, slotKeys);
  }

  // 講師の空き時間で空き状況をフィルタリング
  // タスクごとに異なる講師がいるため、タスク入力に講師情報を含める
  const taskInputs: TaskInput[] = pendingTasks.map((t) => ({
    id: t.id,
    title: t.title,
    duration: t.duration,
    priority: t.priority,
    preferredDays: (t.preferredDays as number[]) || [],
    preferredPeriods: (t.preferredPeriods as number[]) || [],
    instructorId: t.instructorId || undefined,
  }));

  // 講師制約付きの空き状況: 講師が設定されたタスクは講師の空き時間のみ候補とする
  const instructorFilteredAvailability = (taskInstructorId: string | undefined) => {
    if (!taskInstructorId) return availability;
    const instrSlots = instructorAvailMap.get(taskInstructorId);
    if (!instrSlots) return []; // 講師の空き情報がない場合は配置不可
    return availability.filter((slot) => instrSlots.has(`${slot.day}-${slot.period}`));
  };

  const solveResult = solve(taskInputs, availability, totalMembers, instructorFilteredAvailability);

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

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "自動配置実行", `グループ(${groupId})の自動配置を実行しました（${solveResult.placements.length}件配置）`);

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

  const user = await userRepo.findById(userId);
  logActivity(userId, user?.name || "Unknown", "配置結果確定", `配置結果(${resultId})を確定しました（${placements.length}件）`);

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
