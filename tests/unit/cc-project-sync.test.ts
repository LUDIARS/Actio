import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { clearTestDatabase, initTestDatabase } from "../helpers.js";

let syncProjectsFromCc: typeof import("../../modules/task/team/cc-project-sync.js").syncProjectsFromCc;
let taskRepo: typeof import("../../src/db/repository.js").taskRepo;
let projectRefRepo: typeof import("../../src/db/repository.js").projectRefRepo;

beforeAll(async () => {
  initTestDatabase();
  ({ syncProjectsFromCc } = await import("../../modules/task/team/cc-project-sync.js"));
  ({ taskRepo, projectRefRepo } = await import("../../src/db/repository.js"));
});

function fetchReturning(payload: unknown): typeof fetch {
  return (async () => ({ ok: true, status: 200, json: async () => payload })) as unknown as typeof fetch;
}

async function createTask(id: string, projectId: string | null, teamId: string | null = null, sprintId: string | null = null): Promise<void> {
  await taskRepo.create({ id, ownerId: "owner", title: id, projectId, teamId, sprintId });
}

async function sync(entries: unknown[]) {
  return syncProjectsFromCc(fetchReturning({ entries }));
}

describe("syncProjectsFromCc task propagation", () => {
  beforeEach(() => {
    clearTestDatabase();
    process.env.CONCORDIA_URL = "http://concordia.test";
  });

  it("works as before when Cc does not send renamed_from", async () => {
    await createTask("old", "LwP");
    await sync([{ code: "LwP", project: "Ludellus-Praeforma" }]);
    const result = await sync([{ code: "LP", project: "Ludellus-Praeforma" }]);
    expect(result).toEqual({ ok: true, synced: 1, renamedTasks: 0, teamBoundTasks: 0 });
    expect((await taskRepo.findById("old"))?.projectId).toBe("LwP");
    expect((await projectRefRepo.findByCode("LwP"))?.removedAt).not.toBeNull();
  });

  it("moves tasks of a renamed code to the new code", async () => {
    await createTask("old", "LwP");
    await createTask("other", "At");
    await sync([{ code: "LwP", project: "Ludellus-Praeforma" }, { code: "At", project: "Actio" }]);
    const result = await sync([
      { code: "LP", project: "Ludellus-Praeforma", renamed_from: ["LwP"] },
      { code: "At", project: "Actio" },
    ]);
    expect(result).toMatchObject({ ok: true, renamedTasks: 1 });
    expect((await taskRepo.findById("old"))?.projectId).toBe("LP");
    expect((await taskRepo.findById("other"))?.projectId).toBe("At");
    expect((await projectRefRepo.findByCode("LwP"))?.removedAt).not.toBeNull();
  });

  it("binds team-less tasks when a project gets exactly one team, and leaves multi-team projects alone", async () => {
    await sync([{ code: "Cc", project: "Concordia" }, { code: "Cr", project: "Cernere" }]);
    await createTask("cc-free", "Cc");
    await createTask("cc-team", "Cc", "t9");
    await createTask("cr-free", "Cr");
    const result = await sync([
      { code: "Cc", project: "Concordia", teams: [{ id: "t1" }] },
      { code: "Cr", project: "Cernere", teams: [{ id: "t1" }, { id: "t2" }] },
    ]);
    expect(result).toMatchObject({ ok: true, teamBoundTasks: 1 });
    expect((await taskRepo.findById("cc-free"))?.teamId).toBe("t1");
    expect((await taskRepo.findById("cc-team"))?.teamId).toBe("t9");
    expect((await taskRepo.findById("cr-free"))?.teamId).toBeNull();
  });

  it("does not touch team-less tasks when team_ids did not change", async () => {
    await sync([{ code: "Cc", project: "Concordia", teams: [{ id: "t1" }] }]);
    await createTask("cc-free", "Cc");
    const result = await sync([{ code: "Cc", project: "Concordia", teams: [{ id: "t1" }] }]);
    expect(result).toMatchObject({ ok: true, teamBoundTasks: 0 });
    expect((await taskRepo.findById("cc-free"))?.teamId).toBeNull();
  });
});
