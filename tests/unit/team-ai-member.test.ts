import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono, type Context, type Next } from "hono";

const repo = vi.hoisted(() => ({
  roles: new Map<string, string>(),
  teams: new Set<string>(),
}));
vi.mock("../../src/db/repository.js", () => ({
  teamMemberRepo: {
    findRole: async (teamId: string, userId: string) => repo.roles.get(`${teamId}/${userId}`),
    upsert: async (teamId: string, userId: string, role: string) => { repo.roles.set(`${teamId}/${userId}`, role); },
    remove: async (teamId: string, userId: string) => { repo.roles.delete(`${teamId}/${userId}`); },
  },
  teamRefRepo: { findById: async (id: string) => (repo.teams.has(id) ? { id } : undefined) },
}));
vi.mock("../../src/config/secrets.js", () => ({ secretManager: { getOrDefault: () => "" } }));
vi.mock("../../src/auth/local-owner.js", () => ({
  isLocalOwnerRequest: () => false,
  resolveLocalOwnerTeamRole: async () => undefined,
}));

import { aiMemberCallName, aiMemberId, humanTeamRole, isAiCallName, isAiMemberId } from "../../src/auth/ai-member-id.js";
import { requireTeamRole } from "../../src/auth/team-role.js";
import { toTeamMemberView } from "../../modules/task/team/ai-member.js";
import { alignExecutorWithAssignee } from "../../modules/task/team/ai-assignee-executor.js";
import { routeAiRecipients } from "../../modules/task/team/ai-recipients.js";
import { interpretTemplateLookup, lookupDelegationTemplate, type TemplateLookup } from "../../modules/task/team/cc-template-lookup.js";
import { createAiMemberRoutes } from "../../modules/task/team/ai-member-routes.js";
import { enqueueNotifications, type EnqueueDeps } from "../../modules/task/notifications/enqueue.js";
import type { NewTaskNotification } from "../../src/db/repository.js";

const NOT_REQUESTED = { executorType: undefined, aiExecutor: undefined };
const HUMAN = { executorType: "human" as const, aiExecutor: null };

beforeEach(() => { repo.roles.clear(); repo.teams.clear(); repo.teams.add("team-1"); });

describe("AI member ids", () => {
  it("keeps AI member ids apart from human user ids", () => {
    expect(aiMemberId("fable")).toBe("ai:fable");
    expect(isAiMemberId("ai:fable")).toBe(true);
    expect(isAiMemberId("5b838175-8eaa-448a-91e8-325c655562e5")).toBe(false);
    expect(isAiMemberId("actio-local")).toBe(false);
    expect(aiMemberCallName("ai:codex/impl")).toBe("codex/impl");
    expect(aiMemberCallName("ai:")).toBeNull();
    expect(aiMemberCallName(null)).toBeNull();
  });

  it("accepts only call names that fit ai_executor", () => {
    expect(isAiCallName("fable")).toBe(true);
    expect(isAiCallName("has space")).toBe(false);
    expect(isAiCallName("ai:nested")).toBe(false);
    expect(isAiCallName("x".repeat(121))).toBe(false);
  });

  it("marks AI members in the member list", () => {
    expect(toTeamMemberView({ userId: "ai:fable", role: "ai" })).toEqual({ userId: "ai:fable", role: "ai", kind: "ai", callName: "fable" });
    expect(toTeamMemberView({ userId: "user-1", role: "leader" })).toEqual({ userId: "user-1", role: "leader", kind: "human", callName: null });
  });
});

describe("humanTeamRole", () => {
  it("never grants a human role to an AI member, whatever role the row carries", () => {
    expect(humanTeamRole("ai:fable", "ai")).toBeUndefined();
    expect(humanTeamRole("ai:fable", "leader")).toBeUndefined();
    expect(humanTeamRole("user-1", "ai")).toBeUndefined();
    expect(humanTeamRole("user-1", "leader")).toBe("leader");
    expect(humanTeamRole("user-1", undefined)).toBeUndefined();
  });
});

describe("alignExecutorWithAssignee", () => {
  it("makes the AI member the executor of a task it is responsible for", () => {
    expect(alignExecutorWithAssignee({ assigneeId: "ai:fable", previousAssigneeId: null, executor: HUMAN, requested: NOT_REQUESTED }))
      .toEqual({ value: { executorType: "ai", aiExecutor: "fable" } });
    expect(alignExecutorWithAssignee({
      assigneeId: "ai:fable", previousAssigneeId: "user-1",
      executor: { executorType: "ai", aiExecutor: "fable" }, requested: { executorType: "ai", aiExecutor: "fable" },
    }).value).toEqual({ executorType: "ai", aiExecutor: "fable" });
  });

  it("rejects an executor that contradicts the AI assignee instead of overwriting it", () => {
    expect(alignExecutorWithAssignee({ assigneeId: "ai:fable", previousAssigneeId: null, executor: HUMAN, requested: { executorType: "human", aiExecutor: undefined } }).error)
      .toContain("executor_type must be ai");
    expect(alignExecutorWithAssignee({
      assigneeId: "ai:fable", previousAssigneeId: null,
      executor: { executorType: "ai", aiExecutor: "opus" }, requested: { executorType: "ai", aiExecutor: "opus" },
    }).error).toContain("ai_executor must be fable");
  });

  it("returns the work to a human when the assignee changes from the AI member to a human", () => {
    expect(alignExecutorWithAssignee({
      assigneeId: "user-1", previousAssigneeId: "ai:fable",
      executor: { executorType: "ai", aiExecutor: "fable" }, requested: NOT_REQUESTED,
    }).value).toEqual(HUMAN);
  });

  it("leaves human-assigned tasks as requested", () => {
    const executor = { executorType: "ai" as const, aiExecutor: "codex/impl" };
    expect(alignExecutorWithAssignee({ assigneeId: "user-1", previousAssigneeId: "user-2", executor, requested: NOT_REQUESTED }).value).toEqual(executor);
    expect(alignExecutorWithAssignee({
      assigneeId: "user-1", previousAssigneeId: "ai:fable", executor, requested: { executorType: "ai", aiExecutor: "codex/impl" },
    }).value).toEqual(executor);
  });
});

describe("routeAiRecipients", () => {
  it("skips a notification addressed only to AI members and says why", () => {
    const route = routeAiRecipients({ recipientIds: ["ai:fable"] });
    expect(route.deliver).toBe(false);
    expect(route.skippedAiIds).toEqual(["ai:fable"]);
    expect(route.reason).toContain("ai:fable");
  });

  it("delivers to the remaining humans and to team-wide notifications", () => {
    expect(routeAiRecipients({ recipientIds: ["owner", "ai:fable"] })).toEqual({ deliver: true, recipientIds: ["owner"], skippedAiIds: ["ai:fable"], reason: null });
    expect(routeAiRecipients({ recipientIds: [] }).deliver).toBe(true);
  });
});

describe("enqueueNotifications", () => {
  function deps(rows: NewTaskNotification[]): EnqueueDeps {
    return {
      insertIfAbsent: async (row) => { rows.push(row); return true; },
      frontendUrl: () => "", now: () => new Date("2026-11-26T00:00:00Z"), newId: () => `n-${rows.length}`,
    };
  }
  const intent = { event: "task.assigned", taskId: "task-1", teamId: "team-1", title: "t", body: "b" };

  it("records an AI-only notification as skipped instead of dropping or sending it", async () => {
    const rows: NewTaskNotification[] = [];
    const queued = await enqueueNotifications([{ ...intent, recipientIds: ["ai:fable"], dedupeKey: "k1" }], deps(rows));
    expect(queued).toBe(0);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("skipped");
    expect(rows[0].lastError).toContain("ai:fable");
  });

  it("keeps human notifications pending", async () => {
    const rows: NewTaskNotification[] = [];
    expect(await enqueueNotifications([{ ...intent, recipientIds: ["member"], dedupeKey: "k2" }], deps(rows))).toBe(1);
    expect(rows[0].status).toBe("pending");
    expect(rows[0].lastError).toBeNull();
  });
});

describe("delegation template lookup", () => {
  it("maps Concordia statuses", () => {
    expect(interpretTemplateLookup(200)).toBe("found");
    expect(interpretTemplateLookup(404)).toBe("missing");
    expect(interpretTemplateLookup(500)).toBe("unavailable");
    expect(interpretTemplateLookup(401)).toBe("unavailable");
  });

  it("returns the canonical call_name and never treats an unreachable Concordia as missing", async () => {
    const found = (async () => new Response(JSON.stringify({ template: { call_name: "fable", title: "実装委託" } }), { status: 200 })) as typeof fetch;
    expect(await lookupDelegationTemplate("http://cc.local/", "fable", found)).toEqual({ outcome: "found", callName: "fable", title: "実装委託" });
    const missing = (async () => new Response("{}", { status: 404 })) as typeof fetch;
    expect((await lookupDelegationTemplate("http://cc.local", "nope", missing)).outcome).toBe("missing");
    const down = (async () => { throw new Error("ECONNREFUSED"); }) as typeof fetch;
    expect((await lookupDelegationTemplate("http://cc.local", "fable", down)).outcome).toBe("unavailable");
    expect((await lookupDelegationTemplate("", "fable", found)).outcome).toBe("unavailable");
    const malformed = (async () => new Response(JSON.stringify({ template: {} }), { status: 200 })) as typeof fetch;
    expect((await lookupDelegationTemplate("http://cc.local", "fable", malformed)).outcome).toBe("unavailable");
  });
});

describe("AI member routes", () => {
  function app(lookup: TemplateLookup, identity: { userId: string; userRole?: string } = { userId: "leader-1" }) {
    const hono = new Hono();
    hono.use("*", async (c: Context, next: Next) => {
      c.set("userId" as never, identity.userId as never);
      if (identity.userRole) c.set("userRole" as never, identity.userRole as never);
      await next();
    });
    hono.route("/api/teams", createAiMemberRoutes({ lookupTemplate: async () => lookup }));
    return hono;
  }
  const found: TemplateLookup = { outcome: "found", callName: "fable", title: "実装委託 (Fable)" };

  it("registers a template that exists in Concordia as an AI member", async () => {
    repo.roles.set("team-1/leader-1", "leader");
    const response = await app(found).request("/api/teams/team-1/ai-members/fable", { method: "PUT" });
    expect(response.status).toBe(200);
    expect((await response.json() as { member: unknown }).member).toMatchObject({ userId: "ai:fable", kind: "ai", callName: "fable", role: "ai" });
    expect(repo.roles.get("team-1/ai:fable")).toBe("ai");
  });

  it("answers 400 for an unknown template and 502 when Concordia cannot be reached", async () => {
    repo.roles.set("team-1/leader-1", "leader");
    expect((await app({ outcome: "missing" }).request("/api/teams/team-1/ai-members/nope", { method: "PUT" })).status).toBe(400);
    expect((await app({ outcome: "unavailable", reason: "down" }).request("/api/teams/team-1/ai-members/fable", { method: "PUT" })).status).toBe(502);
    expect(repo.roles.has("team-1/ai:fable")).toBe(false);
    expect(repo.roles.has("team-1/ai:nope")).toBe(false);
  });

  it("lets leaders and admins manage AI members, not plain members", async () => {
    repo.roles.set("team-1/member-1", "member");
    expect((await app(found, { userId: "member-1" }).request("/api/teams/team-1/ai-members/fable", { method: "PUT" })).status).toBe(403);
    expect((await app(found, { userId: "admin-1", userRole: "admin" }).request("/api/teams/team-1/ai-members/fable", { method: "PUT" })).status).toBe(200);
    expect((await app(found, { userId: "member-1" }).request("/api/teams/team-1/ai-members/fable", { method: "DELETE" })).status).toBe(403);
  });

  it("removes an AI member and answers 404 when it is not registered", async () => {
    repo.roles.set("team-1/leader-1", "leader");
    repo.roles.set("team-1/ai:fable", "ai");
    expect((await app(found).request("/api/teams/team-1/ai-members/fable", { method: "DELETE" })).status).toBe(200);
    expect(repo.roles.has("team-1/ai:fable")).toBe(false);
    expect((await app(found).request("/api/teams/team-1/ai-members/fable", { method: "DELETE" })).status).toBe(404);
  });
});

describe("requireTeamRole with AI members", () => {
  function app(identity: { userId?: string; apiClientId?: string }) {
    const hono = new Hono();
    hono.use("*", async (c: Context, next: Next) => {
      if (identity.userId) c.set("userId" as never, identity.userId as never);
      if (identity.apiClientId) c.set("apiClientId" as never, identity.apiClientId as never);
      await next();
    });
    hono.post("/api/teams/:teamId/decide", requireTeamRole("leader"), (c) => c.json({ actor: c.get("actingUserId" as never) }));
    return hono;
  }

  it("refuses an AI member as X-Decided-By even when its row says leader", async () => {
    repo.roles.set("team-1/ai:fable", "leader");
    repo.roles.set("team-1/leader-1", "leader");
    const service = app({ apiClientId: "cc" });
    expect((await service.request("/api/teams/team-1/decide", { method: "POST", headers: { "X-Decided-By": "ai:fable" } })).status).toBe(403);
    expect((await service.request("/api/teams/team-1/decide", { method: "POST", headers: { "X-Decided-By": "leader-1" } })).status).toBe(200);
  });

  it("refuses an AI member as the acting user", async () => {
    repo.roles.set("team-1/ai:fable", "leader");
    expect((await app({ userId: "ai:fable" }).request("/api/teams/team-1/decide", { method: "POST" })).status).toBe(403);
  });
});
