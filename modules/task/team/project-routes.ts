/**
 * Cc から同期したプロジェクトの参照 API (task-integration §6.3)。
 * - `GET /api/teams/:teamId/projects` — そのチームに属するプロジェクト
 * - `GET /api/projects/cc` — 同期済みプロジェクト一覧 (チーム所属付き)
 */

import { Hono } from "hono";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { projectRefRepo } from "../../../src/db/repository.js";

export const teamProjectRoutes = new Hono();

teamProjectRoutes.get("/:teamId/projects", requireTeamRole("member"), async (c) => {
  const projects = await projectRefRepo.listByTeam(c.req.param("teamId"));
  return c.json({ projects: projects.map((project) => ({ code: project.code, name: project.name })) });
});

export const ccProjectRoutes = new Hono();

ccProjectRoutes.get("/cc", async (c) => {
  const projects = await projectRefRepo.listActive();
  return c.json({ projects: projects.map((project) => ({ code: project.code, name: project.name, teamIds: project.teamIds, syncedAt: project.syncedAt })) });
});
