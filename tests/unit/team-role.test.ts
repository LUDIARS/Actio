import { Hono } from "hono";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDatabase, initTestDatabase, insertTestTeamMember } from "../helpers.js";

let requireTeamRole: typeof import("../../src/auth/team-role.js").requireTeamRole;

beforeAll(async () => {
  initTestDatabase();
  ({ requireTeamRole } = await import("../../src/auth/team-role.js"));
});

/** userContext / requireApiKey が設定するコンテキストを模したテストアプリ */
function buildApp(context: { userId?: string; userRole?: string; apiClientId?: string }) {
  const app = new Hono();
  app.use("*", async (c, next) => {
    if (context.userId) c.set("userId" as never, context.userId as never);
    if (context.userRole) c.set("userRole" as never, context.userRole as never);
    if (context.apiClientId) c.set("apiClientId" as never, context.apiClientId as never);
    await next();
  });
  app.get("/teams/:teamId/probe", requireTeamRole("leader"), (c) =>
    c.json({ actingUserId: c.get("actingUserId" as never), teamRole: c.get("teamRole" as never) }),
  );
  return app;
}

describe("requireTeamRole", () => {
  beforeEach(() => {
    clearTestDatabase();
    insertTestTeamMember({ teamId: "team-1", userId: "leader-1", role: "leader" });
    insertTestTeamMember({ teamId: "team-1", userId: "member-1", role: "member" });
  });

  it("allows a leader and exposes the acting user", async () => {
    const res = await buildApp({ userId: "leader-1", userRole: "general" }).request("/teams/team-1/probe");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actingUserId: "leader-1", teamRole: "leader" });
  });

  it("rejects a member when leader is required", async () => {
    const res = await buildApp({ userId: "member-1", userRole: "general" }).request("/teams/team-1/probe");
    expect(res.status).toBe(403);
  });

  it("rejects non-members and anonymous requests", async () => {
    expect((await buildApp({ userId: "outsider", userRole: "general" }).request("/teams/team-1/probe")).status).toBe(403);
    expect((await buildApp({}).request("/teams/team-1/probe")).status).toBe(403);
  });

  it("bypasses membership for Actio admins", async () => {
    const res = await buildApp({ userId: "admin-1", userRole: "admin" }).request("/teams/team-1/probe");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actingUserId: "admin-1", teamRole: "admin" });
  });

  describe("Cc service path (api_client token)", () => {
    it("requires X-Decided-By", async () => {
      const res = await buildApp({ apiClientId: "client-1" }).request("/teams/team-1/probe");
      expect(res.status).toBe(403);
    });

    it("rejects a decided_by user that cannot be mapped to the required role", async () => {
      const app = buildApp({ apiClientId: "client-1" });
      const outsider = await app.request("/teams/team-1/probe", { headers: { "X-Decided-By": "outsider" } });
      expect(outsider.status).toBe(403);
      const member = await app.request("/teams/team-1/probe", { headers: { "X-Decided-By": "member-1" } });
      expect(member.status).toBe(403);
    });

    it("accepts a decided_by leader and records them as the acting user", async () => {
      const res = await buildApp({ apiClientId: "client-1" }).request("/teams/team-1/probe", {
        headers: { "X-Decided-By": "leader-1" },
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ actingUserId: "leader-1", teamRole: "leader" });
    });
  });
});
