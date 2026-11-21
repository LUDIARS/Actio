import { describe, expect, it, vi } from "vitest";
import { Hono, type Context, type Next } from "hono";
import { hashSync } from "bcryptjs";
import { PlanningError } from "../../modules/task/planning/contracts.js";

const mocks = vi.hoisted(() => ({
  findClient: vi.fn(),
  read: vi.fn(),
  enroll: vi.fn(),
}));
vi.mock("../../src/db/repository.js", () => ({
  apiClientRepo: { findByClientId: mocks.findClient, updateLastUsed: async () => {} },
}));
vi.mock("../../src/db/planning-repository.js", () => ({
  planningRepositories: () => ({ autonomousControl: { read: mocks.read, enroll: mocks.enroll } }),
}));
vi.mock("../../src/auth/local-mode.js", () => ({ isLocalModeRequest: () => false }));
vi.mock("../../src/auth/team-role.js", () => ({
  requireTeamRole: () => async (c: Context, next: Next) => {
    c.set("teamRole" as never, "leader" as never);
    c.set("actingUserId" as never, c.get("userId" as never));
    await next();
  },
}));
import { autonomousSprintRoutes } from "../../modules/task/autonomous-sprint/routes.js";
import { ownsLoop } from "../../modules/task/autonomous-sprint/access.js";

const path = "/api/teams/team/planning/autonomous-sprint";
const key = { "X-API-Client-ID": "public-key", "X-API-Client-Secret": "fixture-secret", "X-Decided-By": "leader" };
const fixtureClient = { id: "internal", userId: "leader", isActive: true, clientSecretHash: hashSync(key["X-API-Client-Secret"], 4) };

function fixture(userId?: string): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (userId) c.set("userId" as never, userId as never);
    await next();
  });
  app.onError((error, c) => error instanceof PlanningError ? c.json({ error: error.message }, error.status) : c.json({ error: "unexpected" }, 500));
  app.route("/api/teams", autonomousSprintRoutes);
  return app;
}

describe("dots HTTP boundary", () => {
  it("requires the dedicated scope even when the caller presents a real user or names a leader", async () => {
    mocks.read.mockClear();
    mocks.findClient.mockResolvedValue({ ...fixtureClient, scopes: ["tasks"] });
    const app = fixture("leader");
    expect((await app.request(path + "/dots", { headers: { "X-Decided-By": "leader" } })).status).toBe(401);
    expect((await app.request(path + "/dots", { headers: key })).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });

  it("passes only the verified client's internal ID and masks a different team or key", async () => {
    mocks.read.mockImplementation(async (team: string, _now: Date, clientId: string) => {
      if (team !== "team" || !ownsLoop(clientId, "internal")) throw new PlanningError("Not found", 404);
      return { id: "run" };
    });
    mocks.findClient.mockResolvedValue({ ...fixtureClient, scopes: ["autonomous-sprint"] });
    expect((await fixture().request(path + "/dots", { headers: key })).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith("team", expect.any(Date), "internal");
    expect((await fixture().request(path.replace("/team/", "/other/") + "/dots", { headers: key })).status).toBe(404);
    mocks.findClient.mockResolvedValue({ ...fixtureClient, id: "wrong-internal", scopes: ["autonomous-sprint"] });
    expect((await fixture().request(path + "/dots", { headers: key })).status).toBe(404);
  });

  it("requires the leader to own the key used for initial enrollment", async () => {
    mocks.enroll.mockClear();
    mocks.findClient.mockResolvedValue({ ...fixtureClient, userId: "other", scopes: ["autonomous-sprint"] });
    const response = await fixture("leader").request(path, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sprintId: "sprint", clientId: "public-key" }),
    });
    expect(response.status).toBe(403);
    expect(mocks.enroll).not.toHaveBeenCalled();
  });
});
