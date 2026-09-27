import { Hono, type Context } from "hono";
import { requireApiKey } from "../../external-api/middleware.js";
import { isLocalModeRequest } from "../../../src/auth/local-mode.js";
import { bodyLimit } from "hono/body-limit";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { secretManager } from "../../../src/config/secrets.js";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { PraeformaClient } from "../planning/praeforma-client.js";
import { actionSchema } from "./contracts.js";

export const implementationRoutes = new Hono();
const base = "/:teamId/planning/praeforma/projects/:pid/implementation";
implementationRoutes.use(base + "/*", bodyLimit({ maxSize: 131072 }));
function canConfirm(c: Context): boolean {
  return !c.get("apiClientId" as never) && !isLocalModeRequest(c) && c.get("userId" as never) !== "actio-local"
    && ["leader", "admin"].includes(c.get("teamRole" as never) as string);
}
function client(): PraeformaClient {
  const url = secretManager.get("PRAEFORMA_URL");
  if (!url) throw new Error("PRAEFORMA_URL をサービス所有カタログから設定してください");
  return new PraeformaClient(url, secretManager.get("PRAEFORMA_TOKEN") || undefined);
}
async function list(c: Context) {
  let manifest;
  try { manifest = await client().implementationManifest(c.req.param("pid")!); }
  catch { return c.json({ error: "Pf の現行仕様を取得できません。接続設定を確認してください" }, 502); }
  if (manifest.teamId !== c.req.param("teamId")) return c.json({ error: "Pf プロジェクトのチームが一致しません" }, 403);
  return c.json({ projectId: manifest.projectId, canConfirm: canConfirm(c), items: await planningRepositories().implementation.list(manifest.teamId, manifest.projectId, manifest.subjects) });
}
implementationRoutes.get(base, requireTeamRole("member"), list);
implementationRoutes.get(`${base}/service`, requireApiKey("tasks"), requireTeamRole("member"), list);
implementationRoutes.post(`${base}/:kind/:id`, requireTeamRole("leader"), async c => {
  const input = actionSchema.parse(await c.req.json().catch(() => null));
  // A service may report work or create a backlog; it cannot impersonate a human acceptance click.
  if (input.action === "confirm" && !canConfirm(c)) return c.json({ error: "Actio にログインした人間の確認が必要です" }, 403);
  let manifest;
  try { manifest = await client().implementationManifest(c.req.param("pid")); }
  catch { return c.json({ error: "確認前の Pf 仕様再取得に失敗しました" }, 502); }
  if (manifest.teamId !== c.req.param("teamId")) return c.json({ error: "Pf プロジェクトのチームが一致しません" }, 403);
  const subject = manifest.subjects.find(item => item.kind === c.req.param("kind") && item.id === c.req.param("id"));
  if (!subject) return c.json({ error: "仕様・シナリオが見つかりません" }, 404);
  const item = await planningRepositories().implementation.change(manifest.teamId, manifest.projectId, subject,
    c.get("actingUserId" as never) as string, input, new Date());
  return c.json({ item });
});
