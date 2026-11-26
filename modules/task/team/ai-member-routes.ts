/**
 * チームの AI メンバー API (spec/feature/team-task/spec.md §3.1)
 *
 * - `PUT /api/teams/:teamId/ai-members/:identifier` 登録 (leader / admin / ローカルモードの持ち主)
 * - `DELETE /api/teams/:teamId/ai-members/:callName` 削除 (同上)
 *
 * 登録時に Cc の delegation template の存在を確かめる。 無ければ 400、 Cc に届かなければ 502。
 * 一覧は `GET /api/teams/:teamId/members` が人間と区別して返す。
 */

import { Hono } from "hono";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { AI_MEMBER_ROLE, aiMemberId, isAiCallName } from "../../../src/auth/ai-member-id.js";
import { secretManager } from "../../../src/config/secrets.js";
import { teamMemberRepo, teamRefRepo } from "../../../src/db/repository.js";
import { toTeamMemberView } from "./ai-member.js";
import { lookupDelegationTemplate, type TemplateLookup } from "./cc-template-lookup.js";

export interface AiMemberRouteDeps {
  lookupTemplate(identifier: string): Promise<TemplateLookup>;
}

const defaultDeps: AiMemberRouteDeps = {
  lookupTemplate: (identifier) => lookupDelegationTemplate(secretManager.getOrDefault("CONCORDIA_URL", ""), identifier),
};

export function createAiMemberRoutes(deps: AiMemberRouteDeps = defaultDeps): Hono {
  const routes = new Hono();

  routes.put("/:teamId/ai-members/:identifier", requireTeamRole("leader"), async (c) => {
    const teamId = c.req.param("teamId");
    const identifier = c.req.param("identifier");
    // Cc は id (UUID) と call_name のどちらでも引ける。 どちらも同じ文字種に収まる。
    if (!isAiCallName(identifier)) return c.json({ error: "identifier must be a delegation template call_name" }, 400);
    if (!(await teamRefRepo.findById(teamId))) return c.json({ error: "Team not found" }, 404);
    const template = await deps.lookupTemplate(identifier);
    if (template.outcome === "unavailable") {
      console.warn(`[team-ai-member] Cc の template を確認できませんでした: ${template.reason}`);
      return c.json({ error: "Concordia で delegation template を確認できません。接続を確認して再度登録してください" }, 502);
    }
    if (template.outcome === "missing") return c.json({ error: "delegation template not found in Concordia" }, 400);
    const userId = aiMemberId(template.callName);
    await teamMemberRepo.upsert(teamId, userId, AI_MEMBER_ROLE);
    return c.json({ member: { ...toTeamMemberView({ userId, role: AI_MEMBER_ROLE }), teamId, title: template.title } });
  });

  routes.delete("/:teamId/ai-members/:callName", requireTeamRole("leader"), async (c) => {
    const teamId = c.req.param("teamId");
    const callName = c.req.param("callName");
    if (!isAiCallName(callName)) return c.json({ error: "callName must be a delegation template call_name" }, 400);
    const userId = aiMemberId(callName);
    if ((await teamMemberRepo.findRole(teamId, userId)) === undefined) return c.json({ error: "AI member not found" }, 404);
    await teamMemberRepo.remove(teamId, userId);
    return c.json({ ok: true });
  });

  return routes;
}

export const aiMemberRoutes = createAiMemberRoutes();
