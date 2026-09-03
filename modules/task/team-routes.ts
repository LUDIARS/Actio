import { Hono } from "hono";
import { taskRepo, teamRefRepo } from "../../src/db/repository.js";
import { getUserRole } from "../../src/middleware/getUserId.js";
import { resolveUserId } from "./personal.js";
import { readTeamInputMode } from "./team/settings.js";
import { validateLaneTransition, validateTeamTask } from "./validation/team-task.js";

export const teamTaskRoutes = new Hono();

teamTaskRoutes.patch("/:id/lane", async (c) => {
  const userId = resolveUserId(c);
  const task = await taskRepo.findById(c.req.param("id"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  if (!task.teamId) return c.json({ error: "Lane transitions are only available for team tasks" }, 400);
  const isAdmin = getUserRole(c) === "admin";
  if (task.ownerId !== userId && task.assigneeId !== userId && !isAdmin) return c.json({ error: "Forbidden" }, 403);
  if (!isAdmin && !await taskRepo.isTeamMember(task.teamId, userId)) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json<{ lane?: "daily" | "backlog"; deadline?: string | null; duration_days?: number | null; durationDays?: number | null }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);
  if (body.lane !== "daily" && body.lane !== "backlog") return c.json({ error: "lane must be daily or backlog" }, 400);
  const deadline = body.deadline === undefined || body.deadline === null ? body.deadline : new Date(body.deadline);
  if (deadline instanceof Date && Number.isNaN(deadline.getTime())) return c.json({ error: "Invalid deadline" }, 400);
  const durationDays = body.durationDays !== undefined ? body.durationDays : body.duration_days;
  const result = validateLaneTransition(task, { lane: body.lane, deadline, durationDays });
  if (result.error) return c.json({ error: result.error }, 400);
  const nextDurationDays = durationDays !== undefined ? durationDays : task.durationDays;
  const teamRef = await teamRefRepo.findById(task.teamId);
  const validation = await validateTeamTask({
    ...task,
    lane: body.lane,
    deadline: result.deadline !== undefined ? result.deadline : task.deadline,
    durationDays: nextDurationDays,
  }, readTeamInputMode(teamRef?.settings), {
    isMember: (teamId, memberId) => taskRepo.isTeamMember(teamId, memberId),
    isTaskInTeam: async (teamId, taskId) => (await taskRepo.findById(taskId))?.teamId === teamId,
  });
  if (validation.error) return c.json({ error: validation.error }, 400);
  await taskRepo.update(task.id, {
    lane: body.lane,
    deadline: validation.value.deadline,
    durationDays: nextDurationDays,
  });
  return c.json({ task: await taskRepo.findById(task.id) });
});
