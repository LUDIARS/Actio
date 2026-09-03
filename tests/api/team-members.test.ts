import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  clearTestDatabase,
  generateTestToken,
  initTestDatabase,
  insertTestTeamMember,
  insertTestTeamRef,
  insertTestUser,
  request,
} from "../helpers.js";

let app: any;
beforeAll(async () => { initTestDatabase(); app = (await import("../../src/app.js")).createApp().app; });
beforeEach(() => {
  clearTestDatabase();
  insertTestUser({ id: "leader-1", name: "Leader", email: "leader@example.test" });
  insertTestUser({ id: "member-1", name: "Member", email: "member@example.test" });
  insertTestUser({ id: "admin-1", name: "Admin", email: "admin@example.test", role: "admin" });
  insertTestTeamRef({ id: "team-1", slug: "one", name: "Team One", settings: { completion_threshold: 0.5 } });
  insertTestTeamMember({ teamId: "team-1", userId: "leader-1", role: "leader" });
  insertTestTeamMember({ teamId: "team-1", userId: "member-1", role: "member" });
});

const leader = () => generateTestToken("leader-1");
const member = () => generateTestToken("member-1");
const admin = () => generateTestToken("admin-1", "admin");

describe("GET /api/teams", () => {
  it("lists the requester's teams with role and Cc names", async () => {
    const res = await request(app, "GET", "/api/teams", { token: member() });
    expect(res.status).toBe(200);
    expect(res.json.teams).toEqual([{ id: "team-1", slug: "one", name: "Team One", role: "member" }]);
  });

  it("requires authentication", async () => {
    const res = await request(app, "GET", "/api/teams", {});
    expect(res.status).toBe(401);
  });
});

describe("GET /api/teams/:teamId/members", () => {
  it("returns members for a team member", async () => {
    const res = await request(app, "GET", "/api/teams/team-1/members", { token: member() });
    expect(res.status).toBe(200);
    expect(res.json.members).toHaveLength(2);
  });

  it("rejects non-members but allows admins", async () => {
    insertTestUser({ id: "outsider", name: "Out", email: "out@example.test" });
    expect((await request(app, "GET", "/api/teams/team-1/members", { token: generateTestToken("outsider") })).status).toBe(403);
    expect((await request(app, "GET", "/api/teams/team-1/members", { token: admin() })).status).toBe(200);
  });
});

describe("PUT/DELETE /api/teams/:teamId/members/:userId", () => {
  it("lets an admin add and update a member's role", async () => {
    insertTestUser({ id: "new-1", name: "New", email: "new@example.test" });
    const added = await request(app, "PUT", "/api/teams/team-1/members/new-1", { token: admin(), body: { role: "member" } });
    expect(added.status).toBe(200);
    const promoted = await request(app, "PUT", "/api/teams/team-1/members/new-1", { token: admin(), body: { role: "leader" } });
    expect(promoted.status).toBe(200);
    const listed = await request(app, "GET", "/api/teams/team-1/members", { token: admin() });
    expect(listed.json.members).toContainEqual({ userId: "new-1", role: "leader" });
  });

  it("rejects invalid roles and unknown teams", async () => {
    expect((await request(app, "PUT", "/api/teams/team-1/members/member-1", { token: admin(), body: { role: "owner" } })).status).toBe(400);
    expect((await request(app, "PUT", "/api/teams/no-such/members/member-1", { token: admin(), body: { role: "member" } })).status).toBe(404);
  });

  it("rejects role changes from leaders and members (§3: admin のみ)", async () => {
    expect((await request(app, "PUT", "/api/teams/team-1/members/member-1", { token: leader(), body: { role: "leader" } })).status).toBe(403);
    expect((await request(app, "DELETE", "/api/teams/team-1/members/member-1", { token: member() })).status).toBe(403);
  });

  it("lets an admin remove a member, 404 when absent", async () => {
    expect((await request(app, "DELETE", "/api/teams/team-1/members/member-1", { token: admin() })).status).toBe(200);
    expect((await request(app, "DELETE", "/api/teams/team-1/members/member-1", { token: admin() })).status).toBe(404);
  });
});

describe("GET/PATCH /api/teams/:teamId/settings", () => {
  it("returns settings to leaders, rejects members", async () => {
    const res = await request(app, "GET", "/api/teams/team-1/settings", { token: leader() });
    expect(res.status).toBe(200);
    expect(res.json.settings.completion_threshold).toBe(0.5);
    expect((await request(app, "GET", "/api/teams/team-1/settings", { token: member() })).status).toBe(403);
  });

  it("merges a valid patch and keeps other keys", async () => {
    const res = await request(app, "PATCH", "/api/teams/team-1/settings", {
      token: leader(),
      body: { daily_stale_days: 7 },
    });
    expect(res.status).toBe(200);
    expect(res.json.settings.daily_stale_days).toBe(7);
    expect(res.json.settings.completion_threshold).toBe(0.5);
  });

  it("rejects unknown keys and invalid values", async () => {
    expect((await request(app, "PATCH", "/api/teams/team-1/settings", { token: leader(), body: { nope: 1 } })).status).toBe(400);
    expect((await request(app, "PATCH", "/api/teams/team-1/settings", { token: leader(), body: { completion_threshold: 2 } })).status).toBe(400);
    expect((await request(app, "PATCH", "/api/teams/team-1/settings", { token: leader(), body: { review_slots: ["25:00"] } })).status).toBe(400);
  });

  it("accepts the documented work-window tuple", async () => {
    const res = await request(app, "PATCH", "/api/teams/team-1/settings", {
      token: leader(),
      body: { work_window: ["10:00", "23:00"] },
    });
    expect(res.status).toBe(200);
    expect(res.json.settings.work_window).toEqual(["10:00", "23:00"]);
  });

  it("allows admins to update settings", async () => {
    const res = await request(app, "PATCH", "/api/teams/team-1/settings", { token: admin(), body: { standup_enabled: false } });
    expect(res.status).toBe(200);
    expect(res.json.settings.standup_enabled).toBe(false);
  });
});
