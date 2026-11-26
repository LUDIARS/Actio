import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono, type Context, type Next } from "hono";
import { PlanningError } from "../../modules/task/planning/contracts.js";

const mocks = vi.hoisted(() => ({
  view: vi.fn(), decide: vi.fn(), context: vi.fn(), eventOutcome: vi.fn(),
  verify: vi.fn(), authority: vi.fn(() => ({})), recordBlocked: vi.fn(),
  breaker: vi.fn(),
}));
vi.mock("../../src/db/planning-repository.js", () => ({
  planningRepositories: () => ({
    gates: { view: mocks.view, decide: mocks.decide, context: mocks.context, eventOutcome: mocks.eventOutcome },
    scrumMaster: { verify: mocks.verify, authority: mocks.authority, recordBlocked: mocks.recordBlocked },
  }),
}));
vi.mock("../../src/db/repository.js", () => ({ apiClientRepo: { findByClientId: async () => undefined, updateLastUsed: async () => {} } }));
vi.mock("../../src/auth/local-mode.js", () => ({
  localAccessKind: (c: Context) => c.get("fixtureAccess" as never) ?? null,
  isLocalModeRequest: (c: Context) => Boolean(c.get("fixtureAccess" as never)),
}));
vi.mock("../../src/auth/team-role.js", () => ({ requireTeamRole: () => async (_c: Context, next: Next) => { await next(); } }));
vi.mock("../../src/config/secrets.js", () => ({ secretManager: { get: () => "http://127.0.0.1:1" } }));
vi.mock("../../modules/task/autonomous-sprint/breaker.js", () => ({ checkSprintBreaker: mocks.breaker }));

import { scrumMasterBoundary } from "../../modules/task/scrum-master/boundary.js";
import { scrumMasterPhaseRoutes } from "../../modules/task/scrum-master/phase-routes.js";
import { sprintGateRoutes } from "../../modules/task/sprint-gates/routes.js";

function app(access: "loopback" | "cf-access" | null): Hono {
  const host = new Hono();
  host.use("/api/*", scrumMasterBoundary());
  host.use("*", async (c, next) => {
    if (access) {
      c.set("fixtureAccess" as never, access as never);
      c.set("userId" as never, "actio-local" as never);
    }
    await next();
  });
  host.onError((error, c) => error instanceof PlanningError ? c.json({ error: error.message }, error.status) : c.json({ error: "unexpected" }, 500));
  host.route("/api/teams", scrumMasterPhaseRoutes);
  host.route("/api/teams", sprintGateRoutes);
  host.patch("/api/tasks/:id", c => c.json({ ok: true }));
  return host;
}

const path = "/api/teams/team/planning/sprints/sprint/phase";
const identity = { "X-Actio-Scrum-Master": "terpsichore", "X-Actio-AI-Session": "cc-1" };
const body = { eventId: "answer", action: "approve", expectedRevision: 1, sourceFingerprint: "a".repeat(64), reason: "Judged" };
const decide = (access: "loopback" | "cf-access" | null, headers: Record<string, string>) =>
  app(access).request(path + "/decisions", {
    method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.view.mockResolvedValue({ state: { phase: "planning" }, autonomous: false });
  mocks.decide.mockResolvedValue({ outcome: "applied", reason: "ok" });
  mocks.eventOutcome.mockResolvedValue(undefined);
  mocks.verify.mockResolvedValue(undefined);
  mocks.breaker.mockResolvedValue("allowed");
});

describe("Scrum master HTTP boundary", () => {
  it("lets a declared local AI session start a sprint after the breaker allows it", async () => {
    expect((await decide("loopback", identity)).status).toBe(200);
    expect(mocks.authority).toHaveBeenCalledWith("team", { actor: "ai-session:cc-1", clientId: null }, true, expect.any(Date));
    expect(mocks.decide).toHaveBeenCalledWith("team", "sprint", "scrum-master:terpsichore",
      expect.objectContaining({ eventId: "sm:answer" }), expect.any(Date), false, expect.anything());
  });

  it("keeps local-mode and AI requests without the role out of the human path", async () => {
    expect((await decide("loopback", {})).status).toBe(403);
    expect((await decide("loopback", { "X-Actio-AI-Session": "cc-1" })).status).toBe(403);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("rejects an unknown holder, a missing session, tunnels and invalid API keys", async () => {
    expect((await decide("loopback", { ...identity, "X-Actio-Scrum-Master": "someone" })).status).toBe(403);
    expect((await decide("loopback", { "X-Actio-Scrum-Master": "terpsichore" })).status).toBe(403);
    expect((await decide("cf-access", identity)).status).toBe(403);
    expect((await decide(null, identity)).status).toBe(403);
    expect((await decide("loopback", { ...identity, "X-API-Client-ID": "x", "X-API-Client-Secret": "y" })).status).toBe(401);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("does not decide while the breaker is open or unconfirmed", async () => {
    mocks.breaker.mockResolvedValue("open");
    expect((await decide("loopback", identity)).status).toBe(409);
    mocks.breaker.mockResolvedValue("unavailable");
    expect((await decide("loopback", identity)).status).toBe(503);
    expect(mocks.recordBlocked).toHaveBeenCalledTimes(2);
    expect(mocks.decide).not.toHaveBeenCalled();
  });

  it("skips the breaker for decisions that start nothing and for replayed answers", async () => {
    mocks.view.mockResolvedValue({ state: { phase: "acceptance" }, autonomous: false });
    expect((await decide("loopback", identity)).status).toBe(200);
    mocks.view.mockResolvedValue({ state: { phase: "planning" }, autonomous: false });
    mocks.eventOutcome.mockResolvedValue({ outcome: "applied", reason: "ok" });
    expect((await decide("loopback", identity)).status).toBe(200);
    expect(mocks.breaker).not.toHaveBeenCalled();
  });

  it("limits a declared request to the two phase writes", async () => {
    const task = await app("loopback").request("/api/tasks/playtest", { method: "PATCH", headers: identity, body: "{}" });
    expect(task.status).toBe(403);
    const role = await app("loopback").request("/api/teams/team/planning/scrum-master", { method: "DELETE", headers: identity });
    expect(role.status).toBe(403);
    expect((await app("loopback").request("/api/tasks/playtest", { method: "PATCH", body: "{}" })).status).toBe(200);
  });
});
