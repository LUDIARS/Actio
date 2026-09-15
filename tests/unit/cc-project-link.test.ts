import { describe, expect, it } from "vitest";
import { parseCcProjects } from "../../modules/task/team/cc-project-parse.js";
import { validateTeamProject } from "../../modules/task/validation/team-project.js";

describe("parseCcProjects", () => {
  it("keeps code, name and team ids and drops repository locations", () => {
    const parsed = parseCcProjects({
      entries: [
        { code: "At", project: "Actio", repo_origin: "https://github.com/LUDIARS/Actio.git", repo_path: "E:/x", teams: [{ id: "t1", name: "T1" }, { id: "t1" }] },
        { code: "Mm", project: "Memoria" },
      ],
    });
    expect(parsed).toEqual([
      { code: "At", name: "Actio", teamIds: ["t1"] },
      { code: "Mm", name: "Memoria", teamIds: [] },
    ]);
    expect(JSON.stringify(parsed)).not.toContain("github");
  });

  it("rejects malformed payloads as a whole", () => {
    expect(parseCcProjects({})).toBeNull();
    expect(parseCcProjects({ entries: [{ code: "bad code", project: "x" }] })).toBeNull();
    expect(parseCcProjects({ entries: [{ code: "At", project: "Actio", teams: [{}] }] })).toBeNull();
  });
});

describe("validateTeamProject", () => {
  const rows = new Map([
    ["At", { teamIds: ["t1"], removedAt: null }],
    ["Old", { teamIds: ["t1"], removedAt: new Date() }],
  ]);
  const find = async (code: string) => rows.get(code);

  it("accepts a project of the same team and ignores personal tasks", async () => {
    expect(await validateTeamProject("t1", "At", find)).toBeUndefined();
    expect(await validateTeamProject(null, "glab-project-1", find)).toBeUndefined();
    expect(await validateTeamProject("t1", null, find)).toBeUndefined();
  });

  it("rejects unknown, removed and foreign-team projects", async () => {
    expect(await validateTeamProject("t1", "Nope", find)).toContain("Concordia project code");
    expect(await validateTeamProject("t1", "Old", find)).toContain("Concordia project code");
    expect(await validateTeamProject("t2", "At", find)).toContain("task's team");
  });
});
