/**
 * `GET /api/teams/:teamId/critical-path` (task-integration §5.3)。 保存値ではなくその場で計算して返す。
 */

import { Hono } from "hono";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { computeTeamCriticalPath } from "./recompute.js";

export const criticalPathRoutes = new Hono();

criticalPathRoutes.get("/:teamId/critical-path", requireTeamRole("member"), async (c) => {
  const { result } = await computeTeamCriticalPath(c.req.param("teamId"));
  return c.json({
    taskIds: result.taskIds,
    totalDays: result.totalDays,
    cycles: result.cycles,
    tasks: result.tasks.map((task) => ({
      id: task.id,
      slackDays: task.slackDays,
      earliestStart: task.earliestStart,
      earliestFinish: task.earliestFinish,
      durationDays: task.durationDays,
      durationSource: task.durationSource,
      isCriticalPath: task.isCriticalPath,
    })),
  });
});
