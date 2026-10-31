import { describe, expect, it } from "vitest";
import { canViewTask, isUnrestricted, type TaskViewer } from "../../src/auth/task-visibility.js";

const scoped: TaskViewer = { kind: "scoped", userId: "u1", teamIds: ["team-a"] };
const task = (fields: Partial<{ ownerId: string; assigneeId: string | null; teamId: string | null }>) => ({
  ownerId: "u2", assigneeId: null, teamId: null, ...fields,
});

describe("isUnrestricted", () => {
  it("管理者とローカル持ち主だけが全件を見る", () => {
    expect(isUnrestricted("admin", false)).toBe(true);
    expect(isUnrestricted("general", true)).toBe(true);
    expect(isUnrestricted("general", false)).toBe(false);
  });
});

describe("canViewTask", () => {
  it("自分が作った・担当のタスクは見える", () => {
    expect(canViewTask(scoped, task({ ownerId: "u1" }))).toBe(true);
    expect(canViewTask(scoped, task({ assigneeId: "u1" }))).toBe(true);
  });

  it("所属チームのタスクは見え、所属外チームと他人の個人タスクは見えない", () => {
    expect(canViewTask(scoped, task({ teamId: "team-a" }))).toBe(true);
    expect(canViewTask(scoped, task({ teamId: "team-b" }))).toBe(false);
    expect(canViewTask(scoped, task({}))).toBe(false);
  });

  it("全件閲覧者は何でも見える", () => {
    expect(canViewTask({ kind: "unrestricted", userId: "u1" }, task({ teamId: "team-b" }))).toBe(true);
  });
});
