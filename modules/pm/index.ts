/**
 * PM (Project Management) モジュール
 *
 * タスク管理ツール (GitHub Issues / Notion Database) と連携し、
 * プロジェクト管理を自動化するモジュール。
 */

import { Hono } from "hono";
import { pmRoutes } from "./routes.js";
import type { SchulaModule } from "../../src/shared/types.js";

const pmRouter = new Hono();
pmRouter.route("/", pmRoutes);

export const pmModule: SchulaModule = {
  name: "pm",
  description: "プロジェクト管理 — GitHub/Notion タスク同期・分析",
  routes: pmRouter,
  basePath: "/api/pm",
  submodules: [
    { id: "projects", name: "プロジェクト管理", path: "/projects" },
    { id: "tasks", name: "タスク管理", path: "/tasks" },
    { id: "analytics", name: "分析・レポート", path: "/analytics" },
  ],
};
