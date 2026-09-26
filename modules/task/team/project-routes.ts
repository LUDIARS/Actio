/**
 * Cc から同期したプロジェクトの参照 API (task-integration §6.3 / §6.4)。
 * - `GET /api/teams/:teamId/projects` — そのチームに属するプロジェクト
 * - `GET /api/projects/cc` — 同期済みプロジェクト一覧 (チーム所属付き)
 * - `GET /api/projects/cc/:code/sprints` — プロジェクト別スプリント集計 (Breviarium 連携、 loopback / 管理者のみ)
 */

import { Hono } from "hono";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { requireLoopbackOrAdmin } from "../../../src/auth/loopback-or-admin.js";
import { dialect } from "../../../src/db/connection.js";
import { projectRefRepo } from "../../../src/db/repository.js";
import { PLANNING_UNSUPPORTED_MESSAGE } from "../planning/contracts.js";
import { queryProjectSprints } from "./project-sprint-query.js";

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

ccProjectRoutes.get("/cc/:code/sprints", requireLoopbackOrAdmin(), async (c) => {
  if (dialect === "mysql") return c.json({ error: PLANNING_UNSUPPORTED_MESSAGE }, 501);
  const summary = await queryProjectSprints(c.req.param("code"), new Date());
  if (!summary) return c.json({ error: "unknown_project" }, 404);
  return c.json(summary);
});
