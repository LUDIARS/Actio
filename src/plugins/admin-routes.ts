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
import { verifyRoleViaCernere } from "../auth/user-info.js";
import { moduleInstallationRepo, moduleStateRepo } from "./repository.js";
import { moduleRegistry } from "./registry.js";
import { setModuleEnabled, isEnabled, uninstallModule } from "./loader.js";

const admin = new Hono();

/**
 * Issue #111 S2 — Admin role を **Cernere 側で再検証** する.
 *
 * 以前は JWT claim の `role` を素朴に信じていたため、改ざん JWT や
 * id-cache の dev fallback を経由した admin 昇格が理論上可能だった.
 * 修正:
 *   - 本番 (`NODE_ENV === "production"`) では Cernere に問い合わせて
 *     `role === "admin"` を確認. **Cernere が応答不能なら 403 で
 *     fail-closed** (サイレントに通さない).
 *   - 開発/テスト環境では Cernere 未接続時に JWT claim へフォールバック
 *     を許す (従来挙動の維持 — ただし警告ログを出す).
 */
async function requireAdmin(
  c: import("hono").Context,
): Promise<{ userId: string } | Response> {
  const userId = getUserId(c);
  if (!userId) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const isProd = (process.env.NODE_ENV ?? "development") === "production";
  const verdict = await verifyRoleViaCernere(userId);

  if (verdict.source === "cernere") {
    if (verdict.role !== "admin") {
      return c.json({ error: "Admin role required" }, 403);
    }
    return { userId };
  }

  // Cernere unreachable
  if (isProd) {
    console.warn(
      `[admin] Cernere unreachable for ${userId}, refusing admin access (production fail-closed).`,
    );
    return c.json({ error: "Admin verification unavailable" }, 403);
  }

  // dev / test: JWT claim にフォールバック
  const jwtRole = getUserRole(c);
  if (jwtRole !== "admin") {
    return c.json({ error: "Admin role required" }, 403);
  }
  console.warn(
    `[admin] Cernere unreachable; falling back to JWT claim for ${userId} (NODE_ENV=${process.env.NODE_ENV ?? "development"})`,
  );
  return { userId };
}

admin.get("/modules", async (c) => {
  const auth = await requireAdmin(c);
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
  const auth = await requireAdmin(c);
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
  const auth = await requireAdmin(c);
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

// ─── Issue #111 D10 — uninstall admin endpoint ────────────

admin.post("/modules/:id/uninstall", async (c) => {
  const auth = await requireAdmin(c);
  if (auth instanceof Response) return auth;

  const moduleId = c.req.param("id");
  if (!moduleRegistry.has(moduleId)) {
    return c.json({ error: `Module "${moduleId}" not installed` }, 404);
  }

  try { await uninstallModule(moduleId); }
  catch (err) { return c.json({ error: (err as Error).message }, 500); }

  return c.json({ ok: true, moduleId, uninstalled: true });
});

// ─── Issue #111 D6 — frontend module federation manifests ──

admin.get("/modules/manifests", async (c) => {
  // 認証必須だが admin 限定ではない (UI 読み込み用).
  const userId = getUserId(c);
  if (!userId) return c.json({ error: "Authentication required" }, 401);

  // ロード済み module から client.remoteEntry を持つものだけ抽出.
  const manifests = moduleRegistry.list()
    .filter((m) => !!m.definition.client?.remoteEntry)
    .map((m) => ({
      moduleId:    m.definition.id,
      name:        m.definition.name,
      description: m.definition.description,
      remoteEntry: m.definition.client!.remoteEntry,
      basePath:    m.definition.basePath,
    }));

  return c.json({ manifests });
});

export { admin as moduleAdminRoutes };
