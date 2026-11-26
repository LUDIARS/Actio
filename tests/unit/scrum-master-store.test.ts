import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { AutonomousSprintControl } from "../../modules/task/autonomous-sprint/control-store.js";
import { SprintStore } from "../../modules/task/planning/sprint-store.js";
import { ScrumMasterStore } from "../../modules/task/scrum-master/store.js";
import type { ScrumMasterPrincipal } from "../../modules/task/scrum-master/contracts.js";
import type { GateView, HumanDecision } from "../../modules/task/sprint-gates/contracts.js";
import { SprintGateStore } from "../../modules/task/sprint-gates/store.js";
import { migratePlanning } from "../../src/db/planning-migration.js";
import { sqliteGateDatabase } from "../../src/db/sprint-gate-database.js";

const now = new Date("2026-11-26T00:00:00Z");
const ACTOR = "scrum-master:terpsichore";
const session: ScrumMasterPrincipal = { actor: "ai-session:cc-1", clientId: null };
let db: Database.Database;
let gates: SprintGateStore;
let roles: ScrumMasterStore;
let current: string;
let next: string;
let counter = 0;

function attach(id: string, sprintId = current, executor = "ai"): void {
  db.prepare(`INSERT INTO tasks(id,team_id,sprint_id,title,status,project_id,assignee_id,priority,executor_type)
    VALUES(?,'team',?,?,'open','At','leader','medium',?)`).run(id, sprintId, id, executor);
}
function finish(id: string): void {
  db.prepare("UPDATE tasks SET status='done' WHERE id=?").run(id);
}
function command(view: GateView, action: HumanDecision["action"], taskIds?: string[]): HumanDecision {
  return { eventId: "sm:" + (++counter), action, expectedRevision: view.state.revision,
    sourceFingerprint: view.state.sourceFingerprint, reason: "Scrum master judged this snapshot", ...(taskIds ? { taskIds } : {}) };
}
async function act(action: HumanDecision["action"], startPermitted = false, principal = session) {
  const view = await gates.view("team", current, now);
  return gates.decide("team", current, ACTOR, command(view, action), now, false,
    roles.authority("team", principal, startPermitted, now));
}
async function asHuman(action: HumanDecision["action"]) {
  const view = await gates.view("team", current, now);
  return gates.decide("team", current, "leader", { ...command(view, action), eventId: "ui:" + (++counter) }, now, true);
}

beforeEach(() => {
  db = new Database(":memory:");
  db.exec(`CREATE TABLE team_refs(id TEXT PRIMARY KEY);
    INSERT INTO team_refs VALUES('team'),('other');
    CREATE TABLE team_members(team_id TEXT,user_id TEXT,role TEXT);
    INSERT INTO team_members VALUES('team','leader','leader');
    CREATE TABLE api_clients(id TEXT PRIMARY KEY, scopes TEXT NOT NULL, is_active INTEGER NOT NULL);
    INSERT INTO api_clients VALUES('dots','["scrum-master"]',1),('plain','["tasks"]',1);
    CREATE TABLE tasks(id TEXT PRIMARY KEY,team_id TEXT,sprint_id TEXT,title TEXT,description TEXT,requirements TEXT,
      status TEXT,priority TEXT,assignee_id TEXT,project_id TEXT,deadline INTEGER,estimated_minutes INTEGER,
      category TEXT,executor_type TEXT,updated_at INTEGER,lane TEXT DEFAULT 'backlog',created_at INTEGER,
      carried_from_sprint_id TEXT,completion_evidence TEXT,blocked_by TEXT DEFAULT '[]');`);
  migratePlanning(db);
  const sprints = new SprintStore(db);
  const settings = { name: "Sprint", goal: "Outcome", cadenceDays: 7, capacityMinutes: 100 };
  current = sprints.create("team", "leader", { ...settings, startsOn: "2026-11-30", endsOn: "2026-12-06", bufferEndsOn: "2026-12-07" }, now).id;
  next = sprints.create("team", "leader", { ...settings, startsOn: "2026-12-08", endsOn: "2026-12-14", bufferEndsOn: "2026-12-15" }, now).id;
  const connection = sqliteGateDatabase(db);
  gates = new SprintGateStore(connection);
  roles = new ScrumMasterStore(connection);
});

afterEach(() => db.close());

describe("Scrum master phase authority", () => {
  it("requires the team assignment and binds the role to the assigned principal", async () => {
    attach("work");
    await expect(act("approve", true)).rejects.toMatchObject({ status: 403 });
    await roles.assign("team", "dots", "leader", now);
    await expect(act("approve", true)).rejects.toMatchObject({ status: 403 });
    await expect(roles.verify("other", { actor: "api-client:dots", clientId: "dots" })).rejects.toMatchObject({ status: 403 });
    db.prepare("UPDATE api_clients SET is_active=0 WHERE id='dots'").run();
    await expect(roles.verify("team", { actor: "api-client:dots", clientId: "dots" })).rejects.toMatchObject({ status: 403 });
    await roles.assign("team", "plain", "leader", now);
    await expect(roles.verify("team", { actor: "api-client:plain", clientId: "plain" })).rejects.toMatchObject({ status: 403 });
    expect((await gates.view("team", current, now)).sprint.status).toBe("planning");
  });

  it("runs every phase through the next sprint and records the role and the executing session", async () => {
    attach("work");
    attach("playtest", current, "human");
    attach("next-work", next);
    await roles.assign("team", null, "leader", now);
    await expect(act("approve", false)).rejects.toMatchObject({ status: 409 });
    expect((await gates.view("team", current, now)).sprint.status).toBe("planning");
    expect((await act("approve", true)).outcome).toBe("applied");
    expect(db.prepare("SELECT status, approved_by FROM sprints WHERE id=?").get(current)).toEqual({ status: "active", approved_by: ACTOR });

    // 人の結果が必要なタスクが残る間は受入確認へ進まない。
    finish("work");
    expect((await gates.view("team", current, now)).state.phase).toBe("implementation");
    expect((await act("approve")).outcome).toBe("rejected");
    finish("playtest");
    expect((await act("approve")).outcome).toBe("applied");

    const review = await gates.view("team", current, now);
    expect(review.state.phase).toBe("retrospective");
    await gates.context("team", current, ACTOR, { expectedRevision: review.state.revision,
      sourceFingerprint: review.state.sourceFingerprint, retrospective: "Learned", nextSprintId: next, reason: "Record" },
    now, false, roles.authority("team", session, false, now));
    expect((await act("approve")).outcome).toBe("applied");
    await expect(act("approve", false)).rejects.toMatchObject({ status: 409 });
    expect((await act("approve", true)).outcome).toBe("applied");

    expect((await gates.view("team", next, now)).sprint.status).toBe("active");
    const actors = db.prepare("SELECT DISTINCT actor_id FROM sprint_gate_history WHERE actor_id IS NOT NULL").all();
    expect(actors).toEqual([{ actor_id: ACTOR }]);
    const audit = db.prepare("SELECT DISTINCT actor_id FROM sprint_scrum_master_events WHERE sprint_id=?").all(current);
    expect(audit).toEqual([{ actor_id: "ai-session:cc-1" }]);
  });

  it("refuses stale revisions and stops answering once the role is removed", async () => {
    attach("work");
    await roles.assign("team", null, "leader", now);
    const view = await gates.view("team", current, now);
    const input = command(view, "approve");
    const stale = { ...input, eventId: "sm:stale", expectedRevision: view.state.revision + 1 };
    const authority = roles.authority("team", session, true, now);
    expect((await gates.decide("team", current, ACTOR, stale, now, false, authority)).outcome).toBe("rejected");
    expect((await gates.decide("team", current, ACTOR, input, now, false, authority)).outcome).toBe("applied");
    await roles.remove("team", "leader", now);
    await expect(gates.decide("team", current, ACTOR, input, now, false, authority)).rejects.toMatchObject({ status: 403 });
  });

  it("leaves a human hold to humans while releasing its own hold", async () => {
    attach("work");
    await roles.assign("team", null, "leader", now);
    expect((await act("hold")).outcome).toBe("applied");
    expect((await act("resume")).outcome).toBe("applied");
    expect((await asHuman("hold")).outcome).toBe("applied");
    await expect(act("resume")).rejects.toMatchObject({ status: 409 });
    await expect(act("hold")).rejects.toMatchObject({ status: 409 });
    expect((await gates.view("team", current, now)).state.held).toBe(true);
    expect((await asHuman("resume")).outcome).toBe("applied");
    expect((await act("approve", true)).outcome).toBe("applied");
  });

  it("keeps one AI decider per team", async () => {
    const control = new AutonomousSprintControl(sqliteGateDatabase(db));
    const leader = { id: "leader", admin: false };
    await roles.assign("team", null, "leader", now);
    await expect(control.enroll("team", current, "dots", 60, leader, now)).rejects.toMatchObject({ status: 409 });
    await roles.remove("team", "leader", now);
    await control.enroll("team", current, "dots", 60, leader, now);
    await expect(roles.assign("team", null, "leader", now)).rejects.toMatchObject({ status: 409 });
  });
});
