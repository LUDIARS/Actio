/**
 * M3 MACHINA: タスク自動生成モジュール ルート
 *
 * Slack/Discord のログを監視し、タスクを自動生成/自動更新する。
 * グループに属する形でタスクを管理。
 *
 * エンドポイント:
 *   - GET    /groups/:groupId/tasks          — タスク一覧
 *   - GET    /groups/:groupId/tasks/:taskId   — タスク詳細
 *   - POST   /groups/:groupId/tasks          — タスク手動作成
 *   - PUT    /groups/:groupId/tasks/:taskId   — タスク更新
 *   - DELETE /groups/:groupId/tasks/:taskId   — タスク削除
 *   - GET    /groups/:groupId/monitors       — チャンネル監視一覧
 *   - POST   /groups/:groupId/monitors       — チャンネル監視追加
 *   - PUT    /groups/:groupId/monitors/:id   — チャンネル監視更新
 *   - DELETE /groups/:groupId/monitors/:id   — チャンネル監視削除
 *   - POST   /groups/:groupId/tasks/:taskId/relay — PM (M2) へリレー
 *   - GET    /groups/:groupId/tasks/:taskId/logs  — タスクログ一覧
 *   - POST   /webhook/slack                  — Slack Incoming Webhook
 *   - POST   /webhook/discord                — Discord Incoming Webhook
 *   - POST   /analyze                        — テキスト解析 (プレビュー)
 */

import { Hono } from "hono";
import { randomUUID } from "crypto";
import { getUserId, getUserRole } from "../../src/middleware/getUserId.js";
import {
  machinaTaskRepo,
  machinaTaskLogRepo,
  machinaChannelMonitorRepo,
  groupMemberRepo,
  userRepo,
} from "../../src/db/repository.js";
import { analyzeMessage } from "./analyzer.js";
import { handleSlackMessage, handleDiscordMessage } from "./webhook-handler.js";
import { relayTaskToPm, relayTaskUpdateToPm, hasPmRelay } from "./pm-relay.js";
import { logActivity as _logActivity } from "../../src/activity-logger.js";

/** logActivity wrapper: userName を "MACHINA" に固定 */
function logMachina(userId: string, action: string, detail: string): void {
  _logActivity(userId, "MACHINA", action, detail);
}
import {
  MACHINA_TASK_STATUSES,
  MACHINA_TASK_PRIORITIES,
} from "../../src/shared/constants.js";
import type { MachinaTaskStatus, MachinaTaskPriority } from "../../src/shared/constants.js";

export const machinaRoutes = new Hono();

// ─── Helpers ──────────────────────────────────────────────────

async function checkGroupAccess(
  userId: string,
  groupId: string,
  systemRole: string
): Promise<boolean> {
  if (systemRole === "admin") return true;
  const memberships = await groupMemberRepo.findByUserId(userId);
  return memberships.some(
    (m: { groupId: string }) => m.groupId === groupId
  );
}

// ─── Tasks CRUD ───────────────────────────────────────────────

// GET /groups/:groupId/tasks — タスク一覧
machinaRoutes.get("/groups/:groupId/tasks", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const status = c.req.query("status");
  const tasks = status
    ? await machinaTaskRepo.findByGroupIdAndStatus(groupId, status)
    : await machinaTaskRepo.findByGroupId(groupId);

  // アサイン先のユーザー名を付与
  const userIds = [...new Set(tasks.map((t) => t.assigneeId).filter(Boolean))] as string[];
  const userMap = new Map<string, string>();
  for (const uid of userIds) {
    const user = await userRepo.findById(uid);
    if (user) userMap.set(uid, user.name);
  }

  const enrichedTasks = tasks.map((t) => ({
    ...t,
    assigneeName: t.assigneeId ? userMap.get(t.assigneeId) ?? null : null,
  }));

  return c.json({ tasks: enrichedTasks });
});

// GET /groups/:groupId/tasks/:taskId — タスク詳細
machinaRoutes.get("/groups/:groupId/tasks/:taskId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");
  const taskId = c.req.param("taskId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const task = await machinaTaskRepo.findById(taskId);
  if (!task || task.groupId !== groupId) {
    return c.json({ error: "タスクが見つかりません" }, 404);
  }

  let assigneeName: string | null = null;
  if (task.assigneeId) {
    const user = await userRepo.findById(task.assigneeId);
    assigneeName = user?.name ?? null;
  }

  const logs = await machinaTaskLogRepo.findByTaskId(taskId);

  return c.json({ task: { ...task, assigneeName }, logs });
});

// POST /groups/:groupId/tasks — タスク手動作成
machinaRoutes.post("/groups/:groupId/tasks", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const body = await c.req.json<{
    title: string;
    description?: string;
    priority?: MachinaTaskPriority;
    assigneeId?: string;
    dueDate?: string;
  }>();

  if (!body.title || body.title.trim().length === 0) {
    return c.json({ error: "タイトルは必須です" }, 400);
  }

  if (body.priority && !MACHINA_TASK_PRIORITIES.includes(body.priority)) {
    return c.json({ error: `優先度は ${MACHINA_TASK_PRIORITIES.join("/")} のいずれかです` }, 400);
  }

  const taskId = randomUUID();
  const now = new Date();

  await machinaTaskRepo.create({
    id: taskId,
    groupId,
    title: body.title.trim(),
    description: body.description ?? null,
    status: "pending",
    priority: body.priority ?? "medium",
    assigneeId: body.assigneeId ?? null,
    dueDate: body.dueDate ?? null,
    source: "manual",
    sourcePlatform: null,
    sourceMessageId: null,
    sourceChannelId: null,
    sourceText: null,
    confidence: 100,
    isCriticalPath: false,
    relayedToPm: false,
    pmTaskId: null,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  await machinaTaskLogRepo.create({
    id: randomUUID(),
    taskId,
    action: "created",
    previousValue: null,
    newValue: JSON.stringify({ title: body.title, priority: body.priority ?? "medium" }),
    reason: "手動作成",
    triggerMessageId: null,
    performedBy: userId,
    createdAt: now,
  });

  logMachina(userId, "task_created", `タスク「${body.title}」を作成`);

  return c.json({ id: taskId, message: "タスクを作成しました" }, 201);
});

// PUT /groups/:groupId/tasks/:taskId — タスク更新
machinaRoutes.put("/groups/:groupId/tasks/:taskId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");
  const taskId = c.req.param("taskId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const task = await machinaTaskRepo.findById(taskId);
  if (!task || task.groupId !== groupId) {
    return c.json({ error: "タスクが見つかりません" }, 404);
  }

  const body = await c.req.json<{
    title?: string;
    description?: string;
    status?: MachinaTaskStatus;
    priority?: MachinaTaskPriority;
    assigneeId?: string | null;
    dueDate?: string | null;
    isCriticalPath?: boolean;
  }>();

  if (body.status && !MACHINA_TASK_STATUSES.includes(body.status)) {
    return c.json({ error: `ステータスは ${MACHINA_TASK_STATUSES.join("/")} のいずれかです` }, 400);
  }
  if (body.priority && !MACHINA_TASK_PRIORITIES.includes(body.priority)) {
    return c.json({ error: `優先度は ${MACHINA_TASK_PRIORITIES.join("/")} のいずれかです` }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (body.title !== undefined) updates.title = body.title;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status !== undefined) updates.status = body.status;
  if (body.priority !== undefined) updates.priority = body.priority;
  if (body.assigneeId !== undefined) updates.assigneeId = body.assigneeId;
  if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
  if (body.isCriticalPath !== undefined) updates.isCriticalPath = body.isCriticalPath;

  await machinaTaskRepo.update(taskId, updates);

  // ステータス変更ログ
  if (body.status && body.status !== task.status) {
    await machinaTaskLogRepo.create({
      id: randomUUID(),
      taskId,
      action: "status_changed",
      previousValue: JSON.stringify({ status: task.status }),
      newValue: JSON.stringify({ status: body.status }),
      reason: null,
      triggerMessageId: null,
      performedBy: userId,
      createdAt: new Date(),
    });
  }

  // アサイン変更ログ
  if (body.assigneeId !== undefined && body.assigneeId !== task.assigneeId) {
    await machinaTaskLogRepo.create({
      id: randomUUID(),
      taskId,
      action: "assigned",
      previousValue: JSON.stringify({ assigneeId: task.assigneeId }),
      newValue: JSON.stringify({ assigneeId: body.assigneeId }),
      reason: null,
      triggerMessageId: null,
      performedBy: userId,
      createdAt: new Date(),
    });
  }

  // 優先度変更ログ
  if (body.priority && body.priority !== task.priority) {
    await machinaTaskLogRepo.create({
      id: randomUUID(),
      taskId,
      action: "priority_changed",
      previousValue: JSON.stringify({ priority: task.priority }),
      newValue: JSON.stringify({ priority: body.priority }),
      reason: null,
      triggerMessageId: null,
      performedBy: userId,
      createdAt: new Date(),
    });
  }

  // PM リレー（PMタスクIDがある場合は更新を転送）
  if (task.pmTaskId) {
    await relayTaskUpdateToPm(task.pmTaskId, updates);
  }

  logMachina(userId, "task_updated", `タスク「${task.title}」を更新`);

  return c.json({ message: "タスクを更新しました" });
});

// DELETE /groups/:groupId/tasks/:taskId — タスク削除
machinaRoutes.delete("/groups/:groupId/tasks/:taskId", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");
  const taskId = c.req.param("taskId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const task = await machinaTaskRepo.findById(taskId);
  if (!task || task.groupId !== groupId) {
    return c.json({ error: "タスクが見つかりません" }, 404);
  }

  await machinaTaskRepo.deleteById(taskId);
  logMachina(userId, "task_deleted", `タスク「${task.title}」を削除`);

  return c.json({ deleted: taskId });
});

// ─── Task Logs ────────────────────────────────────────────────

// GET /groups/:groupId/tasks/:taskId/logs — タスクログ一覧
machinaRoutes.get("/groups/:groupId/tasks/:taskId/logs", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");
  const taskId = c.req.param("taskId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const task = await machinaTaskRepo.findById(taskId);
  if (!task || task.groupId !== groupId) {
    return c.json({ error: "タスクが見つかりません" }, 404);
  }

  const logs = await machinaTaskLogRepo.findByTaskId(taskId);
  return c.json({ logs });
});

// ─── PM Relay ─────────────────────────────────────────────────

// POST /groups/:groupId/tasks/:taskId/relay — PM (M2) へ手動リレー
machinaRoutes.post("/groups/:groupId/tasks/:taskId/relay", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");
  const taskId = c.req.param("taskId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const task = await machinaTaskRepo.findById(taskId);
  if (!task || task.groupId !== groupId) {
    return c.json({ error: "タスクが見つかりません" }, 404);
  }

  if (task.relayedToPm) {
    return c.json({ error: "このタスクは既にPMへリレー済みです", pmTaskId: task.pmTaskId }, 409);
  }

  if (!hasPmRelay()) {
    return c.json({ error: "PMモジュール (M2) が接続されていません" }, 503);
  }

  const result = await relayTaskToPm(task);
  if (!result) {
    return c.json({ error: "PMへのリレーに失敗しました" }, 500);
  }

  await machinaTaskRepo.update(taskId, {
    relayedToPm: true,
    pmTaskId: result.pmTaskId,
  });

  await machinaTaskLogRepo.create({
    id: randomUUID(),
    taskId,
    action: "relayed",
    previousValue: null,
    newValue: JSON.stringify({ pmTaskId: result.pmTaskId }),
    reason: "手動リレー",
    triggerMessageId: null,
    performedBy: userId,
    createdAt: new Date(),
  });

  logMachina(userId, "task_relayed", `タスク「${task.title}」をPMへリレー`);

  return c.json({ message: "PMへリレーしました", pmTaskId: result.pmTaskId });
});

// ─── Channel Monitors CRUD ────────────────────────────────────

// GET /groups/:groupId/monitors — チャンネル監視一覧
machinaRoutes.get("/groups/:groupId/monitors", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const monitors = await machinaChannelMonitorRepo.findByGroupId(groupId);
  return c.json({ monitors });
});

// POST /groups/:groupId/monitors — チャンネル監視追加
machinaRoutes.post("/groups/:groupId/monitors", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const body = await c.req.json<{
    platform: string;
    channelId: string;
    channelName: string;
    webhookEndpointId?: string;
  }>();

  if (!body.platform || !["slack", "discord"].includes(body.platform)) {
    return c.json({ error: "platform は slack / discord のいずれかです" }, 400);
  }
  if (!body.channelId || !body.channelName) {
    return c.json({ error: "channelId と channelName は必須です" }, 400);
  }

  const id = randomUUID();
  const now = new Date();

  await machinaChannelMonitorRepo.create({
    id,
    groupId,
    platform: body.platform,
    channelId: body.channelId,
    channelName: body.channelName,
    webhookEndpointId: body.webhookEndpointId ?? null,
    isActive: true,
    createdBy: userId,
    createdAt: now,
    updatedAt: now,
  });

  logMachina(userId, "monitor_created", `チャンネル監視「${body.channelName}」を追加`);

  return c.json({ id, message: "チャンネル監視を追加しました" }, 201);
});

// PUT /groups/:groupId/monitors/:id — チャンネル監視更新
machinaRoutes.put("/groups/:groupId/monitors/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");
  const monitorId = c.req.param("id");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const monitor = await machinaChannelMonitorRepo.findById(monitorId);
  if (!monitor || monitor.groupId !== groupId) {
    return c.json({ error: "チャンネル監視が見つかりません" }, 404);
  }

  const body = await c.req.json<{
    channelName?: string;
    isActive?: boolean;
    webhookEndpointId?: string | null;
  }>();

  const updates: Record<string, unknown> = {};
  if (body.channelName !== undefined) updates.channelName = body.channelName;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.webhookEndpointId !== undefined) updates.webhookEndpointId = body.webhookEndpointId;

  await machinaChannelMonitorRepo.update(monitorId, updates);

  return c.json({ message: "チャンネル監視を更新しました" });
});

// DELETE /groups/:groupId/monitors/:id — チャンネル監視削除
machinaRoutes.delete("/groups/:groupId/monitors/:id", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);
  const systemRole = getUserRole(c);
  const groupId = c.req.param("groupId");
  const monitorId = c.req.param("id");

  if (!(await checkGroupAccess(userId, groupId, systemRole))) {
    return c.json({ error: "このグループへのアクセス権がありません" }, 403);
  }

  const monitor = await machinaChannelMonitorRepo.findById(monitorId);
  if (!monitor || monitor.groupId !== groupId) {
    return c.json({ error: "チャンネル監視が見つかりません" }, 404);
  }

  await machinaChannelMonitorRepo.deleteById(monitorId);
  logMachina(userId, "monitor_deleted", `チャンネル監視「${monitor.channelName}」を削除`);

  return c.json({ deleted: monitorId });
});

// ─── Webhook Receivers ────────────────────────────────────────

// POST /webhook/slack — Slack Event APIの受信
machinaRoutes.post("/webhook/slack", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();

  // Slack URL Verification challenge
  if (body.type === "url_verification") {
    return c.json({ challenge: body.challenge });
  }

  // Event callback
  if (body.type === "event_callback") {
    const event = body.event as Record<string, unknown>;
    if (event.type === "message" && !event.subtype) {
      const groupId = c.req.query("groupId");
      if (!groupId) {
        return c.json({ error: "groupId query parameter required" }, 400);
      }

      // 非同期処理（レスポンスを先に返す）
      handleSlackMessage(
        event as unknown as Parameters<typeof handleSlackMessage>[0],
        groupId
      ).catch((err: unknown) => {
        console.error("[machina:webhook:slack] メッセージ処理エラー:", err);
      });
    }
  }

  return c.json({ ok: true });
});

// POST /webhook/discord — Discord Webhook の受信
machinaRoutes.post("/webhook/discord", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const groupId = c.req.query("groupId");

  if (!groupId) {
    return c.json({ error: "groupId query parameter required" }, 400);
  }

  // Discord のメッセージイベント
  if (body.content && body.author) {
    handleDiscordMessage(
      body as unknown as Parameters<typeof handleDiscordMessage>[0],
      groupId
    ).catch((err: unknown) => {
      console.error("[machina:webhook:discord] メッセージ処理エラー:", err);
    });
  }

  return c.json({ ok: true });
});

// ─── Text Analysis (Preview) ─────────────────────────────────

// POST /analyze — テキスト解析プレビュー
machinaRoutes.post("/analyze", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  const body = await c.req.json<{
    text: string;
    platform?: string;
  }>();

  if (!body.text) {
    return c.json({ error: "text は必須です" }, 400);
  }

  const result = analyzeMessage({
    text: body.text,
    platform: (body.platform as "slack" | "discord") || "slack",
  });

  return c.json({ analysis: result });
});

// ─── Status / Info ────────────────────────────────────────────

// GET /status — MACHINA モジュールの状態
machinaRoutes.get("/status", async (c) => {
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  return c.json({
    module: "M3 MACHINA",
    description: "タスク自動生成モジュール",
    pmRelayConnected: hasPmRelay(),
    features: [
      "Slack/Discord チャンネル監視",
      "ルールベースタスク自動生成",
      "自動アサイン / 優先度判定 / 納期設定",
      "PM (M2) リレー",
    ],
  });
});
