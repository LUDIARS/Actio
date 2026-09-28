import { describe, expect, it } from "vitest";
import { classifyUnassignedIntake } from "../../modules/task/unassigned-intake.js";

const input = { teamId: null, projectId: "At", source: "concordia.taskflow.v3", category: "開発, 要整理" };
describe("unassigned task intake", () => {
  it("keeps unresolved Cc work and deduplicates the triage labels", async () => {
    expect(await classifyUnassignedIntake(input, async () => undefined)).toBe("一時登録, 要整理, 開発");
  });
  it("marks known projects with no team even without workflow provenance", async () => {
    expect(await classifyUnassignedIntake({ ...input, source: null }, async () => ({ teamIds: [], removedAt: null })))
      .toBe("一時登録, 要整理, 開発");
  });
  it("preserves ordinary personal and opaque external project tasks", async () => {
    expect(await classifyUnassignedIntake({ ...input, source: null }, async () => undefined)).toBe(input.category);
    expect(await classifyUnassignedIntake({ ...input, projectId: null, source: null }, async () => undefined)).toBe(input.category);
  });
  it("does not choose between multiple registered teams", async () => {
    expect(await classifyUnassignedIntake(input, async () => ({ teamIds: ["a", "b"], removedAt: null }))).toBe(input.category);
  });
  it("never reclassifies explicitly scoped team requests", async () => {
    expect(await classifyUnassignedIntake({ ...input, teamId: "a" }, async () => { throw new Error("unexpected lookup"); }))
      .toBe(input.category);
  });
});
