import { Hono } from "hono";
import { taskRepo } from "../../src/db/repository.js";
import { resolveUserId } from "./personal.js";
import { validateLaneTransition } from "./validation/team-task.js";

export const teamTaskRoutes = new Hono();

teamTaskRoutes.patch("/:id/lane", async (c) => {
  const userId = resolveUserId(c);
  const task = await taskRepo.findById(c.req.param("id"));
  if (!task) return c.json({ error: "Task not found" }, 404);
  if (task.ownerId !== userId && task.assigneeId !== userId) return c.json({ error: "Forbidden" }, 403);
  if (!task.teamId) return c.json({ error: "Lane transitions are only available for team tasks" }, 400);
  if (!await taskRepo.isTeamMember(task.teamId, userId)) return c.json({ error: "Forbidden" }, 403);
  const body = await c.req.json<{ lane?: "daily" | "backlog"; deadline?: string | null; duration_days?: number | null; durationDays?: number | null }>()
    .catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);
  if (body.lane !== "daily" && body.lane !== "backlog") return c.json({ error: "lane must be daily or backlog" }, 400);
  const deadline = body.deadline === undefined || body.deadline === null ? body.deadline : new Date(body.deadline);
  if (deadline instanceof Date && Number.isNaN(deadline.getTime())) return c.json({ error: "Invalid deadline" }, 400);
  const durationDays = body.durationDays !== undefined ? body.durationDays : body.duration_days;
  const result = validateLaneTransition(task, { lane: body.lane, deadline, durationDays });
  if (result.error) return c.json({ error: result.error }, 400);
  await taskRepo.update(task.id, { lane: body.lane, deadline: result.deadline, durationDays: durationDays ?? task.durationDays });
  return c.json({ task: await taskRepo.findById(task.id) });
});
