import { Hono } from "hono";
import { z } from "zod";
import { planningRepositories } from "../../../src/db/planning-repository.js";
import { secretManager } from "../../../src/config/secrets.js";
import { requireTeamRole } from "../../../src/auth/team-role.js";
import { PraeformaClient } from "./praeforma-client.js";

export const praeformaRoutes = new Hono();
function client(): PraeformaClient {
  const url = secretManager.get("PRAEFORMA_URL");
  if (!url) throw new Error("PRAEFORMA_URL をサービス所有カタログから設定してください");
  return new PraeformaClient(url, secretManager.get("PRAEFORMA_TOKEN") || undefined);
}
praeformaRoutes.use("/:teamId/planning/praeforma/*", requireTeamRole("leader"));
praeformaRoutes.get("/:teamId/planning/praeforma/projects", async c => {
  try { return c.json({ items: await client().projects() }); }
  catch { return c.json({ error: "Pf に接続できません。PRAEFORMA_URL と Pf の認証設定を確認してください" }, 502); }
});
praeformaRoutes.get("/:teamId/planning/praeforma/projects/:pid/specs", async c => {
  try { return c.json({ items: await client().specs(c.req.param("pid")) }); }
  catch { return c.json({ error: "Pf の仕様一覧を取得できません" }, 502); }
});
praeformaRoutes.get("/:teamId/planning/praeforma/projects/:pid/specs/:sid", async c => {
  try {
    const detail = await client().detail(c.req.param("pid"), c.req.param("sid"));
    return c.json({ ...detail, existingTask: await planningRepositories().specs.existing(c.req.param("teamId"), c.req.param("pid"), c.req.param("sid")) });
  }
  catch { return c.json({ error: "Pf の仕様を取得できません" }, 502); }
});
const importSchema = z.object({ fingerprint: z.string().min(1), assigneeId: z.string().min(1),
  existingFingerprint: z.string().min(1).nullable().optional(),
  deadline: z.iso.datetime({ offset: true }), estimatedMinutes: z.number().int().positive(),
  reviewNote: z.string().trim().min(1).max(5000),
}).strict();
praeformaRoutes.post("/:teamId/planning/praeforma/projects/:pid/specs/:sid/backlog", async c => {
  const input = importSchema.parse(await c.req.json().catch(() => null));
  let detail;
  try { detail = await client().detail(c.req.param("pid"), c.req.param("sid")); }
  catch { return c.json({ error: "登録前の Pf 仕様再確認に失敗しました" }, 502); }
  const result = await planningRepositories().specs.import(c.req.param("teamId"), c.get("actingUserId" as never) as string, detail, input, new Date());
  return c.json(result, result.created ? 201 : 200);
});
