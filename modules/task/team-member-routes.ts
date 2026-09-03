/**
 * チームメンバー / 設定 API (spec/feature/team-task/spec.md §3, §2.3)
 *
 * - `GET /api/teams` 自分が member の team 一覧 + role
 * - `GET /api/teams/:teamId/members` member 以上
 * - `PUT/DELETE /api/teams/:teamId/members/:userId` admin のみ (§3 表)
 * - `GET/PATCH /api/teams/:teamId/settings` leader/admin
 *
 * メンバー/ロールは Actio 正本 (`team_members`)。チームマスタは Cc 同期の
 * `team_refs` キャッシュを参照する。
 */

import { Hono } from "hono";
import { requireRole } from "../../src/middleware/auth.js";
import { requireTeamRole } from "../../src/auth/team-role.js";
import { getUserId } from "../../src/middleware/getUserId.js";
import { teamMemberRepo, teamRefRepo } from "../../src/db/repository.js";
import { TeamSettingsSchema } from "./team/settings.js";

const TEAM_ROLES = ["leader", "member"] as const;

export const teamMemberRoutes = new Hono();

// ─── GET / — 自分が所属する team 一覧 + role ───────────────────

teamMemberRoutes.get("/", async (c) => {
  const userId = getUserId(c);
  if (!userId || userId === "anonymous") return c.json({ error: "Authentication required" }, 401);
  const memberships = await teamMemberRepo.listByUser(userId);
  const refs = await teamRefRepo.findByIds(memberships.map((m) => m.teamId));
  const refById = new Map(refs.map((r) => [r.id, r]));
  const teams = memberships.map((m) => {
    const ref = refById.get(m.teamId);
    return { id: m.teamId, slug: ref?.slug ?? null, name: ref?.name ?? null, role: m.role };
  });
  return c.json({ teams });
});

// ─── GET /:teamId/members — member 以上 ───────────────────────

teamMemberRoutes.get("/:teamId/members", requireTeamRole("member"), async (c) => {
  const members = await teamMemberRepo.listByTeam(c.req.param("teamId"));
  return c.json({ members: members.map((m) => ({ userId: m.userId, role: m.role })) });
});

// ─── PUT/DELETE /:teamId/members/:userId — admin のみ ──────────

teamMemberRoutes.put("/:teamId/members/:userId", requireRole("admin"), async (c) => {
  const teamId = c.req.param("teamId");
  const userId = c.req.param("userId");
  const body = await c.req.json<{ role?: string }>().catch(() => null);
  if (!body || typeof body.role !== "string") return c.json({ error: "role is required" }, 400);
  if (!TEAM_ROLES.includes(body.role as (typeof TEAM_ROLES)[number])) {
    return c.json({ error: `role must be one of: ${TEAM_ROLES.join(", ")}` }, 400);
  }
  if (!(await teamRefRepo.findById(teamId))) return c.json({ error: "Team not found" }, 404);
  await teamMemberRepo.upsert(teamId, userId, body.role);
  return c.json({ member: { teamId, userId, role: body.role } });
});

teamMemberRoutes.delete("/:teamId/members/:userId", requireRole("admin"), async (c) => {
  const teamId = c.req.param("teamId");
  const userId = c.req.param("userId");
  if ((await teamMemberRepo.findRole(teamId, userId)) === undefined) {
    return c.json({ error: "Member not found" }, 404);
  }
  await teamMemberRepo.remove(teamId, userId);
  return c.json({ ok: true });
});

// ─── GET/PATCH /:teamId/settings — leader/admin ────────────────

teamMemberRoutes.get("/:teamId/settings", requireTeamRole("leader"), async (c) => {
  const ref = await teamRefRepo.findById(c.req.param("teamId"));
  if (!ref) return c.json({ error: "Team not found" }, 404);
  return c.json({ settings: ref.settings, cc_settings: ref.ccSettings });
});

teamMemberRoutes.patch("/:teamId/settings", requireTeamRole("leader"), async (c) => {
  const teamId = c.req.param("teamId");
  const ref = await teamRefRepo.findById(teamId);
  if (!ref) return c.json({ error: "Team not found" }, 404);
  const body = await c.req.json<Record<string, unknown>>().catch(() => null);
  if (!body) return c.json({ error: "Invalid JSON body" }, 400);
  const patch = TeamSettingsSchema.partial().strict().safeParse(body);
  if (!patch.success) {
    return c.json({ error: "Invalid settings", issues: patch.error.issues }, 400);
  }
  // partial() は default を補完するので、リクエストに実在するキーだけをマージ対象にする
  const patchData = Object.fromEntries(Object.entries(patch.data).filter(([key]) => key in body));
  // 既存設定へのマージ結果を完全な形で再検証して保存する (Cc 由来 cc_settings は触らない)
  const merged = TeamSettingsSchema.parse({ ...(ref.settings as Record<string, unknown>), ...patchData });
  await teamRefRepo.updateSettings(teamId, merged as unknown as Record<string, unknown>);
  return c.json({ settings: merged });
});
