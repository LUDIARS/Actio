/**
 * `GET /api/public/issues` — パブリックイシュー (認証なし、 spec/feature/public-issues.md §4)。
 * ローカルモードの境界 (isPublicReadRequest) と userContext の外に置く。 GET だけを受ける。
 */
import { Hono } from "hono";
import { taskRepo } from "../../src/db/repository.js";
import { createCcPublicClient } from "./cc-public-client.js";
import { isPublicProjectCode } from "./project-code.js";
import { loadPublicIssues, type PublicIssuesDeps } from "./service.js";

export function createPublicIssueRoutes(deps: PublicIssuesDeps): Hono {
  const routes = new Hono();
  routes.get("/issues", async (c) => {
    const project = c.req.query("project");
    if (project !== undefined && !isPublicProjectCode(project)) {
      return c.json({ error: "project must be a project code" }, 400);
    }
    const body = await loadPublicIssues(deps, project);
    c.header("Cache-Control", "no-store");
    return c.json(body);
  });
  routes.all("/issues", (c) => c.json({ error: "method_not_allowed" }, 405, { Allow: "GET, HEAD" }));
  return routes;
}

export const publicIssueRoutes = createPublicIssueRoutes({
  cc: createCcPublicClient(),
  tasks: {
    findPublicIssues: (projectCode) => taskRepo.findPublicIssues(projectCode),
    findBySourceRefs: (source, sourceRefs) => taskRepo.findBySourceRefs(source, sourceRefs),
  },
});
