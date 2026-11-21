import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { AutonomousSprintControl } from "../../modules/task/autonomous-sprint/control-store.js";
import { AutonomousSprintRunner } from "../../modules/task/autonomous-sprint/runner-store.js";
import type { BreakerVerdict } from "../../modules/task/autonomous-sprint/breaker.js";
import { SprintStore } from "../../modules/task/planning/sprint-store.js";
import { SprintGateStore } from "../../modules/task/sprint-gates/store.js";
import { migratePlanning } from "../../src/db/planning-migration.js";
import { sqliteGateDatabase } from "../../src/db/sprint-gate-database.js";

const now = new Date("2026-11-21T00:00:00Z");
const leader = { id: "leader", admin: false };
let db: Database.Database;
let control: AutonomousSprintControl;
let runner: AutonomousSprintRunner;
let gates: SprintGateStore;
let current: string;
let next: string;

function attach(id: string, sprintId = current, status = "open", dependencies: string[] = []): void {
  db.prepare(`INSERT INTO tasks(id,team_id,sprint_id,title,description,status,project_id,assignee_id,priority,executor_type,blocked_by,updated_at)
    VALUES(?,'team',?,?,'Implement the defined change',?,'At','leader','medium','ai',?,?)`)
    .run(id, sprintId, id, status, JSON.stringify(dependencies), Math.floor(now.getTime() / 1000));
}

async function enroll(): Promise<void> {
  await control.enroll("team", current, "dots", 60, leader, now);
}

async function tick(verdict: BreakerVerdict = "allowed", at = now): Promise<void> {
  for (const run of await runner.candidates()) {
    const request = await runner.step(run, at);
    if (request) await runner.step(run, at, { ...request, verdict });
  }
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE team_refs(id TEXT PRIMARY KEY);
    INSERT INTO team_refs VALUES('team'),('other');
    CREATE TABLE team_members(team_id TEXT,user_id TEXT,role TEXT);
    INSERT INTO team_members VALUES('team','leader','leader');
    CREATE TABLE api_clients(id TEXT PRIMARY KEY, scopes TEXT NOT NULL, is_active INTEGER NOT NULL);
    INSERT INTO api_clients VALUES('dots','["autonomous-sprint"]',1);
    CREATE TABLE tasks(id TEXT PRIMARY KEY,team_id TEXT,sprint_id TEXT,title TEXT,description TEXT,requirements TEXT,
      status TEXT,priority TEXT,assignee_id TEXT,project_id TEXT,deadline INTEGER,estimated_minutes INTEGER,
      category TEXT,executor_type TEXT,updated_at INTEGER,lane TEXT DEFAULT 'backlog',created_at INTEGER,
      carried_from_sprint_id TEXT,completion_evidence TEXT,blocked_by TEXT DEFAULT '[]');`);
  migratePlanning(db);
  const sprints = new SprintStore(db);
  const settings = { name: "Sprint", goal: "Outcome", cadenceDays: 7, capacityMinutes: 100 };
  current = sprints.create("team", "leader", { ...settings, startsOn: "2026-11-21", endsOn: "2026-11-27", bufferEndsOn: "2026-11-28" }, now).id;
  next = sprints.create("team", "leader", { ...settings, startsOn: "2026-11-29", endsOn: "2026-12-05", bufferEndsOn: "2026-12-06" }, now).id;
  const connection = sqliteGateDatabase(db);
  control = new AutonomousSprintControl(connection);
  runner = new AutonomousSprintRunner(connection);
  gates = new SprintGateStore(connection);
});

afterEach(() => db.close());

describe("Opt-in autonomous sprint", () => {
  it("leaves unattended manual sprints in planning and refuses human phase writes after enrolment", async () => {
    const before = await gates.view("team", current, now);
    await tick();
    expect((await gates.view("team", current, now)).state.phase).toBe("planning");
    await expect(control.enroll("team", current, "dots", 60, { id: "other", admin: false }, now)).rejects.toMatchObject({ status: 403 });
    await enroll();
    expect((await gates.view("team", current, now)).autonomous).toBe(true);
    expect(await gates.candidates()).toEqual([{ teamId: "team", id: next }]);
    const result = await gates.decide("team", current, "leader", {
      action: "approve", eventId: "ui:stale", expectedRevision: before.state.revision, sourceFingerprint: before.state.sourceFingerprint, reason: "Manual",
    }, now, true);
    expect(result.outcome).toBe("rejected");
  });

  it("records unavailable and OPEN, preserves the session after reload, and only starts with a current permit", async () => {
    await enroll();
    await tick("unavailable");
    expect(await control.read("team", now, "dots")).toMatchObject({ phase: "planning", warning: "breaker_unavailable" });
    migratePlanning(db);
    control = new AutonomousSprintControl(sqliteGateDatabase(db));
    await tick("open");
    expect(await control.read("team", now, "dots")).toMatchObject({ phase: "planning", warning: "breaker_open" });
    const [run] = await runner.candidates();
    const request = await runner.step(run, now);
    expect(request?.effect).toBe("start_sprint");
    await control.control("team", "dots", { action: "pause", expectedRevision: run.revision, reason: "Intervention" }, now);
    if (request) await runner.step(run, now, { ...request, verdict: "allowed" });
    const paused = await control.read("team", now, "dots");
    expect(paused).toMatchObject({ status: "paused", phase: "planning" });
    await control.control("team", "dots", { action: "resume", expectedRevision: paused!.revision, reason: "Resolved" }, now);
    await tick();
    expect(await control.read("team", now, "dots")).toMatchObject({ phase: "implementation", warning: null });
  });

  it("closes and starts the explicitly selected next sprint atomically after all work is done", async () => {
    attach("work");
    attach("cancelled", current, "cancelled");
    attach("next-work", next);
    await enroll();
    db.prepare("UPDATE tasks SET status='open' WHERE id='cancelled'").run();
    await tick();
    const plan = (await control.read("team", now, "dots"))!;
    await control.control("team", "dots", { action: "policy", expectedRevision: plan.revision, nextSprintId: next, stalledAfterMinutes: 60, reason: "Next cycle" }, now);
    db.prepare("UPDATE tasks SET status='done' WHERE id='work'").run();
    db.prepare("UPDATE tasks SET status='cancelled' WHERE id='cancelled'").run();
    await tick();
    expect(await control.read("team", now, "dots")).toMatchObject({ phase: "implementation", progress: { total: 2, done: 1, cancelled: 1 } });
    db.prepare("UPDATE tasks SET status='done' WHERE id='cancelled'").run();
    for (let count = 0; count < 7; count++) await tick("open");
    expect(await control.read("team", now, "dots")).toMatchObject({ id: plan.id, sprintId: current, phase: "next_planning", warning: "breaker_open" });
    expect((await gates.view("team", next, now)).sprint.status).toBe("planning");
    await tick();
    expect((await gates.view("team", current, now)).sprint.status).toBe("closed");
    expect(await control.read("team", now, "dots")).toMatchObject({ id: plan.id, sprintId: next, cycle: 2, phase: "implementation", nextSprintId: null });
  });

  it("binds dots to one team, revalidates dependencies, keeps one claim, and requires intervention for moved work", async () => {
    attach("work", current, "open", ["dependency"]);
    attach("dependency", next);
    await enroll();
    await tick();
    await expect(control.read("team", now, "different-client")).rejects.toMatchObject({ status: 404 });
    await expect(control.read("other", now, "dots")).rejects.toMatchObject({ status: 404 });
    const run = (await control.read("team", now, "dots"))!;
    await expect(runner.claim("team", "dots", run.revision, "work", now)).rejects.toMatchObject({ status: 409 });
    db.prepare("UPDATE tasks SET status='done' WHERE id='dependency'").run();
    const prepared = await runner.claim("team", "dots", run.revision, "work", now);
    if (prepared.kind !== "prepare") throw new Error("expected ticket");
    expect(await runner.claim("team", "dots", run.revision, "work", now, { ...prepared.ticket, verdict: "allowed" })).toMatchObject({ kind: "claimed" });
    await expect(runner.claim("team", "dots", run.revision, "work", now, { ...prepared.ticket, verdict: "allowed" })).rejects.toMatchObject({ status: 409 });
    await tick("allowed", new Date(now.getTime() + 61 * 60_000));
    expect(await control.read("team", now, "dots")).toMatchObject({ taskId: "work", warning: "task_stalled" });
    db.prepare("UPDATE tasks SET sprint_id=? WHERE id='work'").run(next);
    await tick();
    expect(await control.read("team", now, "dots")).toMatchObject({ status: "paused", taskId: "work", warning: "scope_changed" });
  });
});
