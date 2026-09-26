import { Hono, type MiddlewareHandler } from "hono";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDatabase, initTestDatabase, insertTestTeamMember, insertTestTeamRef } from "../helpers.js";

// The deployment mode is fixed per process in production; these tests flip it through this switch.
const deployment = vi.hoisted(() => ({ localMode: false }));
vi.mock("../../src/auth/local-mode.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/auth/local-mode.js")>()),
  localModeEnabled: () => deployment.localMode,
}));

let localOwner: typeof import("../../src/auth/local-owner.js");
let requireTeamRole: typeof import("../../src/auth/team-role.js").requireTeamRole;

beforeAll(async () => {
  initTestDatabase();
  localOwner = await import("../../src/auth/local-owner.js");
  ({ requireTeamRole } = await import("../../src/auth/team-role.js"));
});

const OWNER = "actio-local";
const fallbackDenies: MiddlewareHandler = async (c) => c.json({ error: "fallback" }, 403);

/** userContext と localModeBoundary() が設定するコンテキストを模したテストアプリ */
function buildApp(context: { userId?: string; userRole?: string; access?: string }) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (context.userId) c.set("userId" as never, context.userId as never);
    if (context.userRole) c.set("userRole" as never, context.userRole as never);
    // The access path the boundary records after resolving loopback / verified cf-access.
    if (context.access) c.set("localAccess" as never, context.access as never);
    await next();
  });
  app.get("/teams/:teamId/lead", requireTeamRole("leader"), (c) =>
    c.json({ actingUserId: c.get("actingUserId" as never), teamRole: c.get("teamRole" as never) }),
  );
  app.put("/teams/:teamId/members/:userId", localOwner.allowLocalOwnerOr(fallbackDenies), (c) => c.json({ ok: true }));
  return app;
}

describe("isLocalOwner", () => {
  it.each(["loopback", "cf-access"] as const)("accepts the fixed local user on the %s path", (access) => {
    expect(localOwner.isLocalOwner(OWNER, access, true)).toBe(true);
  });

  it.each(["loopback", "cf-access"] as const)("never applies when local mode is disabled (%s)", (access) => {
    expect(localOwner.isLocalOwner(OWNER, access, false)).toBe(false);
  });

  it.each(["someone-else", "anonymous", "", null, undefined])("rejects other users (%s)", (userId) => {
    expect(localOwner.isLocalOwner(userId, "loopback", true)).toBe(false);
  });

  it("rejects a request whose access path was not resolved", () => {
    expect(localOwner.isLocalOwner(OWNER, null, true)).toBe(false);
  });
});

describe("localOwnerTeamRole", () => {
  it("grants leader on teams synced into team_refs", () => {
    expect(localOwner.localOwnerTeamRole(true)).toBe("leader");
  });

  it("grants nothing on teams missing from team_refs", () => {
    expect(localOwner.localOwnerTeamRole(false)).toBeUndefined();
  });
});

describe("requireTeamRole for the local owner", () => {
  beforeEach(() => {
    clearTestDatabase();
    insertTestTeamRef({ id: "team-1" });
    deployment.localMode = true;
  });
  afterEach(() => { deployment.localMode = false; });

  it.each(["loopback", "cf-access"])("treats the owner as leader of a synced team without membership (%s)", async (access) => {
    const res = await buildApp({ userId: OWNER, userRole: "general", access }).request("/teams/team-1/lead");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actingUserId: OWNER, teamRole: "leader" });
  });

  it("rejects teams missing from team_refs", async () => {
    const res = await buildApp({ userId: OWNER, userRole: "general", access: "loopback" }).request("/teams/no-such/lead");
    expect(res.status).toBe(403);
  });

  it("does not apply without a resolved access path or with local mode disabled", async () => {
    expect((await buildApp({ userId: OWNER, userRole: "general" }).request("/teams/team-1/lead")).status).toBe(403);
    deployment.localMode = false;
    const res = await buildApp({ userId: OWNER, userRole: "general", access: "loopback" }).request("/teams/team-1/lead");
    expect(res.status).toBe(403);
  });

  it("keeps judging other users by membership", async () => {
    insertTestTeamMember({ teamId: "team-1", userId: "member-1", role: "member" });
    const res = await buildApp({ userId: "member-1", userRole: "general", access: "loopback" }).request("/teams/team-1/lead");
    expect(res.status).toBe(403);
  });
});

describe("allowLocalOwnerOr", () => {
  afterEach(() => { deployment.localMode = false; });

  it("lets the local owner through without consulting the fallback", async () => {
    deployment.localMode = true;
    const res = await buildApp({ userId: OWNER, userRole: "general", access: "cf-access" }).request("/teams/team-1/members/u", { method: "PUT" });
    expect(res.status).toBe(200);
  });

  it("delegates everyone else to the fallback", async () => {
    deployment.localMode = true;
    const other = await buildApp({ userId: "member-1", userRole: "general", access: "loopback" }).request("/teams/team-1/members/u", { method: "PUT" });
    expect(other.status).toBe(403);
    expect(await other.json()).toEqual({ error: "fallback" });
    deployment.localMode = false;
    const publicOwner = await buildApp({ userId: OWNER, userRole: "general", access: "loopback" }).request("/teams/team-1/members/u", { method: "PUT" });
    expect(publicOwner.status).toBe(403);
  });
});
