import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDatabase, initTestDatabase, insertTestTeamRef } from "../helpers.js";

let parseCcTeams: typeof import("../../modules/task/team/cc-sync.js").parseCcTeams;
let syncTeamsFromCc: typeof import("../../modules/task/team/cc-sync.js").syncTeamsFromCc;
let teamRefRepo: typeof import("../../src/db/repository.js").teamRefRepo;

beforeAll(async () => {
  initTestDatabase();
  ({ parseCcTeams, syncTeamsFromCc } = await import("../../modules/task/team/cc-sync.js"));
  ({ teamRefRepo } = await import("../../src/db/repository.js"));
});

function fetchReturning(payload: unknown): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => payload })) as unknown as typeof fetch;
}

describe("parseCcTeams", () => {
  it("maps settings and opaque repository ids without retaining repository locations", () => {
    const teams = parseCcTeams({
      teams: [
        {
          id: "team-1", slug: "one", name: "One",
          settings: { revisor_lane: "local" },
          repo_ids: ["actio", "nested/path", 42],
          repos: ["https://example.test/repo.git", 42],
        },
      ],
    });
    expect(teams).toEqual([
      {
        id: "team-1", slug: "one", name: "One",
        ccSettings: { revisor_lane: "local", repo_ids: ["actio"] },
      },
    ]);
  });

  it("returns null for malformed payloads", () => {
    expect(parseCcTeams(null)).toBeNull();
    expect(parseCcTeams({})).toBeNull();
    expect(parseCcTeams({ teams: [{ slug: "no-id", name: "x" }] })).toBeNull();
  });
});

describe("syncTeamsFromCc", () => {
  beforeEach(() => {
    clearTestDatabase();
    process.env.CONCORDIA_URL = "http://concordia.test";
  });

  it("skips with a warning result when CONCORDIA_URL is unset", async () => {
    delete process.env.CONCORDIA_URL;
    const result = await syncTeamsFromCc(fetchReturning({ teams: [] }));
    expect(result).toEqual({ ok: false, reason: "unconfigured" });
  });

  it("keeps the existing cache when Cc is unreachable", async () => {
    insertTestTeamRef({ id: "team-1", settings: { phase: "release" } });
    const failing = (async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const result = await syncTeamsFromCc(failing);
    expect(result).toEqual({ ok: false, reason: "unreachable" });
    expect(await teamRefRepo.findById("team-1")).toBeDefined();
  });

  it("skips when the response shape is unexpected", async () => {
    const result = await syncTeamsFromCc(fetchReturning({ nope: true }));
    expect(result).toEqual({ ok: false, reason: "malformed" });
  });

  it("inserts new teams with default Actio settings", async () => {
    const result = await syncTeamsFromCc(fetchReturning({
      teams: [{ id: "team-1", slug: "one", name: "One", settings: {}, repo_ids: [] }],
    }));
    expect(result).toEqual({ ok: true, synced: 1 });
    const ref = await teamRefRepo.findById("team-1");
    expect(ref?.slug).toBe("one");
    expect((ref?.settings as Record<string, unknown>).completion_threshold).toBe(0.8);
  });

  it("updates Cc fields but preserves Actio-specific settings", async () => {
    insertTestTeamRef({ id: "team-1", slug: "old", name: "Old", settings: { completion_threshold: 0.5 } });
    const result = await syncTeamsFromCc(fetchReturning({
      teams: [{ id: "team-1", slug: "new", name: "New", settings: { a: 1 }, repo_ids: ["actio"] }],
    }));
    expect(result).toEqual({ ok: true, synced: 1 });
    const ref = await teamRefRepo.findById("team-1");
    expect(ref?.slug).toBe("new");
    expect(ref?.name).toBe("New");
    expect(ref?.ccSettings).toEqual({ a: 1, repo_ids: ["actio"] });
    expect((ref?.settings as Record<string, unknown>).completion_threshold).toBe(0.5);
  });
});
