import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { clearTestDatabase, initTestDatabase, insertTestTeamRef } from "../helpers.js";

type App = ReturnType<typeof import("../../src/app.js").createApp>["app"];

// The deployment mode is read once per module load, so it is set before the app is imported.
let app: App;
beforeAll(async () => {
  vi.stubEnv("ACTIO_LOCAL_MODE", "1");
  initTestDatabase();
  app = (await import("../../src/app.js")).createApp().app;
});
afterAll(() => { vi.unstubAllEnvs(); });

beforeEach(() => {
  clearTestDatabase();
  insertTestTeamRef({ id: "team-1", slug: "one", name: "Team One" });
  insertTestTeamRef({ id: "team-2", slug: "two", name: "Team Two" });
});

/** What getConnInfo() reads for a direct connection from this PC. */
const LOOPBACK_SOCKET = { incoming: { socket: { remoteAddress: "127.0.0.1" } } };

async function call(method: string, path: string, options: { body?: unknown; fromThisPc?: boolean } = {}) {
  const res = await app.request(`http://localhost${path}`, {
    method,
    headers: { host: "localhost", "Content-Type": "application/json" },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  }, options.fromThisPc === false ? undefined : LOOPBACK_SOCKET);
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const sprint = {
  name: "Sprint 1", startsOn: "2026-09-28", endsOn: "2026-10-04", bufferEndsOn: "2026-10-06", cadenceDays: 7,
};

describe("local mode owner — teams synced from Cc", () => {
  it("lists every team_refs team as leader without membership rows", async () => {
    const res = await call("GET", "/api/teams");
    expect(res.status).toBe(200);
    expect(res.json.teams).toHaveLength(2);
    expect(res.json.teams).toEqual(expect.arrayContaining([
      { id: "team-1", slug: "one", name: "Team One", role: "leader" },
      { id: "team-2", slug: "two", name: "Team Two", role: "leader" },
    ]));
  });

  it("opens planning and sprint creation on a synced team", async () => {
    expect((await call("GET", "/api/teams/team-1/planning")).status).toBe(200);
    const created = await call("POST", "/api/teams/team-1/planning/sprints", { body: sprint });
    expect(created.status).toBe(201);
    expect(created.json.sprint.name).toBe("Sprint 1");
  });

  it("rejects teams that are not in team_refs", async () => {
    expect((await call("GET", "/api/teams/no-such/planning")).status).toBe(403);
    expect((await call("POST", "/api/teams/no-such/planning/sprints", { body: sprint })).status).toBe(403);
  });

  it("lets the owner change members (admin equivalent)", async () => {
    const added = await call("PUT", "/api/teams/team-1/members/actio-local", { body: { role: "leader" } });
    expect(added.status).toBe(200);
    const listed = await call("GET", "/api/teams/team-1/members");
    expect(listed.json.members).toEqual([{ userId: "actio-local", role: "leader" }]);
    expect((await call("DELETE", "/api/teams/team-1/members/actio-local")).status).toBe(200);
    expect((await call("PUT", "/api/teams/no-such/members/actio-local", { body: { role: "member" } })).status).toBe(404);
  });

  it("still refuses requests that do not come from this PC", async () => {
    const res = await call("GET", "/api/teams", { fromThisPc: false });
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("local_access_required");
  });
});
