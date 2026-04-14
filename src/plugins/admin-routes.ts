/**
 * Module admin API
 *
 *   GET  /api/admin/modules                  一覧 (installed + states)
 *   POST /api/admin/modules/:id/enable       body: { scopeType, scopeId? }
 *   POST /api/admin/modules/:id/disable      body: { scopeType, scopeId? }
 *
 * 認証は system admin のみ。role 判定は Cernere 経由 (user-info)。
 */

import { Hono } from "hono";
import { getUserId, getUserRole } from "../middleware/getUserId.js";
import { moduleInstallationRepo, moduleStateRepo } from "./repository.js";
import { moduleRegistry } from "./registry.js";
import { setModuleEnabled, isEnabled } from "./loader.js";

const admin = new Hono();

function requireAdmin(
  c: import("hono").Context,
): { userId: string } | Response {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }
  // role は JWT から直接取得 (個人データ Cernere 経由の getUserInfo はテスト環境で
  // Cernere 未接続時にプレースホルダになるため)。Cernere 発行の service_token の
  // claim をそのまま信頼する。
  const role = getUserRole(c);
  if (role !== "admin") {
    return c.json({ error: "Admin role required" }, 403);
  }
  return { userId };
}

admin.get("/modules", async (c) => {
  const auth = requireAdmin(c);
  if (auth instanceof Response) return auth;

  const installations = await moduleInstallationRepo.findAll();
  const result = await Promise.all(
    installations.map(async (inst) => {
      const globalEnabled = await isEnabled(inst.moduleId, "global", null);
      const states = await moduleStateRepo.findAllForModule(inst.moduleId);
      return {
        moduleId: inst.moduleId,
        packageName: inst.packageName,
        packageVersion: inst.packageVersion,
        manifest: inst.manifest,
        installedAt: inst.installedAt,
        globalEnabled,
        loaded: moduleRegistry.has(inst.moduleId),
        states: states.map((s) => ({
          scopeType: s.scopeType,
          scopeId: s.scopeId,
          enabled: s.enabled,
          changedAt: s.changedAt,
          changedBy: s.changedBy,
        })),
      };
    }),
  );
  return c.json({ modules: result });
});

admin.post("/modules/:id/enable", async (c) => {
  const auth = requireAdmin(c);
  if (auth instanceof Response) return auth;

  const moduleId = c.req.param("id");
  if (!moduleRegistry.has(moduleId)) {
    return c.json({ error: `Module "${moduleId}" not installed` }, 404);
  }

  const body = await c.req.json<{ scopeType?: string; scopeId?: string }>();
  const scopeType = (body.scopeType ?? "global") as "global" | "group" | "user";
  const scopeId = body.scopeId ?? null;

  if (!["global", "group", "user"].includes(scopeType)) {
    return c.json({ error: "scopeType must be 'global', 'group', or 'user'" }, 400);
  }

  await setModuleEnabled(moduleId, scopeType, scopeId, true, auth.userId);
  return c.json({ ok: true, moduleId, scopeType, scopeId, enabled: true });
});

admin.post("/modules/:id/disable", async (c) => {
  const auth = requireAdmin(c);
  if (auth instanceof Response) return auth;

  const moduleId = c.req.param("id");
  if (!moduleRegistry.has(moduleId)) {
    return c.json({ error: `Module "${moduleId}" not installed` }, 404);
  }

  const body = await c.req.json<{ scopeType?: string; scopeId?: string }>();
  const scopeType = (body.scopeType ?? "global") as "global" | "group" | "user";
  const scopeId = body.scopeId ?? null;

  if (!["global", "group", "user"].includes(scopeType)) {
    return c.json({ error: "scopeType must be 'global', 'group', or 'user'" }, 400);
  }

  await setModuleEnabled(moduleId, scopeType, scopeId, false, auth.userId);
  return c.json({ ok: true, moduleId, scopeType, scopeId, enabled: false });
});

export { admin as moduleAdminRoutes };
