import { beforeEach, afterEach, describe, it, expect } from "vitest";
import Database from "better-sqlite3";
import { migratePlanning } from "../../src/db/planning-migration.js";
import { sqliteGateDatabase } from "../../src/db/sprint-gate-database.js";
import { SprintGateStore } from "../../modules/task/sprint-gates/store.js";
import { SprintStore } from "../../modules/task/planning/sprint-store.js";
import type { GateView, HumanDecision } from "../../modules/task/sprint-gates/contracts.js";
const now = new Date("2026-09-27T00:00:00Z");
let db: Database.Database, store: SprintGateStore, sprints: SprintStore, id: string;
let counter = 0;
const plan = { name: "Current", goal: "Usable outcome", startsOn: "2026-09-27", endsOn: "2026-10-03", bufferEndsOn: "2026-10-04", cadenceDays: 7, capacityMinutes: 600 };
function command(view: GateView, action: HumanDecision["action"], taskIds?: string[]): HumanDecision { return { eventId: "test:" + (++counter), action, expectedRevision: view.state.revision, sourceFingerprint: view.state.sourceFingerprint, reason: "Human reviewed this exact snapshot", ...(taskIds ? { taskIds } : {}) }; }
async function act(action: HumanDecision["action"], taskIds?: string[]) { const view = await store.view("team", id, now); return store.decide("team", id, "leader", command(view, action, taskIds), now, true); }
function attach(taskId: string, sprintId = id, status = "open", project = "a") { db.prepare("INSERT INTO tasks(id,team_id,sprint_id,title,status,project_id,assignee_id,priority) VALUES(?,'team',?,?,?,?, 'leader','medium')").run(taskId, sprintId, taskId, status, project); }
async function acceptance() { attach("a"); await act("approve"); db.prepare("UPDATE tasks SET status='done' WHERE sprint_id=?").run(id); return store.view("team", id, now); }
beforeEach(() => {
    db = new Database(":memory:");
    db.pragma("foreign_keys=ON");
    db.exec(`CREATE TABLE team_refs(id TEXT PRIMARY KEY);INSERT INTO team_refs VALUES('team');
 CREATE TABLE team_members(team_id TEXT,user_id TEXT,role TEXT);INSERT INTO team_members VALUES('team','leader','leader');
 CREATE TABLE tasks(id TEXT PRIMARY KEY,team_id TEXT,sprint_id TEXT,title TEXT,description TEXT,requirements TEXT,status TEXT,priority TEXT,assignee_id TEXT,project_id TEXT,deadline INTEGER,estimated_minutes INTEGER,category TEXT,updated_at INTEGER,lane TEXT DEFAULT 'backlog',created_at INTEGER,carried_from_sprint_id TEXT,completion_evidence TEXT);
 `);
    migratePlanning(db);
    sprints = new SprintStore(db);
    id = sprints.create("team", "leader", plan, now).id;
    store = new SprintGateStore(sqliteGateDatabase(db));
});
afterEach(() => db.close());
describe("Sprint human lifecycle persistence", () => {
    it("uses every attached project and cancelled/daily tasks, and never loops a rejection into acceptance", async () => {
        attach("a", id, "open", "a");
        attach("b", id, "open", "b");
        expect((await act("approve")).outcome).toBe("applied");
        db.prepare("UPDATE tasks SET status='done' WHERE id='a'").run();
        expect((await store.view("team", id, now)).state.phase).toBe("implementation");
        db.prepare("UPDATE tasks SET status='cancelled',lane='daily' WHERE id='b'").run();
        expect((await store.view("team", id, now)).state.phase).toBe("implementation");
        db.prepare("UPDATE tasks SET status='done' WHERE id='b'").run();
        const ready = await store.view("team", id, now);
        expect(ready.state.phase).toBe("acceptance");
        await act("reject", ["b"]);
        const rejected = await store.view("team", id, now);
        expect(rejected.state.phase).toBe("implementation");
        expect(rejected.state.reworkTaskIds).toEqual(["b"]);
        expect(rejected.sprint).toEqual(ready.sprint);
        expect(rejected.tasks.map(t => [t.id, t.status, t.sprintId])).toEqual(ready.tasks.map(t => [t.id, t.status, t.sprintId]));
        expect((await store.view("team", id, now)).state.revision).toBe(rejected.state.revision);
        expect((await act("resubmit")).outcome).toBe("applied");
        expect((await store.view("team", id, now)).state.phase).toBe("acceptance");
    });
    it("deduplicates an applied event and rejects stale parallel human answers", async () => {
        const ready = await acceptance(), input = command(ready, "approve");
        const [a, b] = await Promise.all([store.decide("team", id, "leader", input, now, true), store.decide("team", id, "leader", { ...input, eventId: "parallel" }, now, true)]);
        expect(a.outcome).toBe("applied");
        expect(b.outcome).toBe("rejected");
        const after = await store.view("team", id, now);
        expect(await store.decide("team", id, "leader", input, now, true)).toEqual(a);
        expect((await store.view("team", id, now)).state.revision).toBe(after.state.revision);
        await expect(store.decide("team", id, "leader", { ...input, reason: "different" }, now, true)).rejects.toThrow("回答ID");
    });
    it("rechecks current evidence even when no observer has run", async () => {
        const ready = await acceptance();
        db.prepare("UPDATE tasks SET description='new requirement' WHERE id='a'").run();
        expect((await store.decide("team", id, "leader", command(ready, "approve"), now, true)).outcome).toBe("rejected");
        expect((await store.view("team", id, now)).state.phase).toBe("acceptance");
    });
    it("requires role and blocks old start/close without carrying unfinished work", async () => {
        attach("a");
        const view = await store.view("team", id, now);
        expect((await store.decide("team", id, "outsider", command(view, "approve"), now, true)).outcome).toBe("rejected");
        for (const action of ["start", "close"] as const)
            expect(() => sprints.change("team", id, "leader", { action, revision: 0, reason: "old API" }, now)).toThrow("フェーズ");
        expect(sprints.find("team", id).status).toBe("planning");
        expect((db.prepare("SELECT sprint_id FROM tasks WHERE id='a'").get() as {
            sprint_id: string;
        }).sprint_id).toBe(id);
    });
    it("rolls back sprint effects, state, event outcome and outbox together after a persistence failure", async () => {
        attach("a");
        const before = await store.view("team", id, now), input = command(before, "approve");
        db.exec("CREATE TRIGGER fail_projection BEFORE INSERT ON sprint_gate_outbox BEGIN SELECT RAISE(ABORT,'projection unavailable'); END;");
        await expect(store.decide("team", id, "leader", input, now, true)).rejects.toThrow("projection unavailable");
        expect(sprints.find("team", id).status).toBe("planning");
        expect(await store.eventOutcome(input.eventId)).toBeUndefined();
        expect((await store.view("team", id, now)).state).toEqual(before.state);
    });
    it("keeps a real hold until an explicit resume and requires retrospective confirmation", async () => {
        await acceptance();
        await act("hold");
        expect((await act("approve")).outcome).toBe("rejected");
        await act("resume");
        await act("approve");
        expect((await store.view("team", id, now)).state.phase).toBe("retrospective");
        expect((await act("approve")).outcome).toBe("rejected");
        const view = await store.view("team", id, now);
        await store.context("team", id, "leader", { expectedRevision: view.state.revision, sourceFingerprint: view.state.sourceFingerprint, retrospective: "Keep the review evidence", nextSprintId: null, reason: "Draft" }, now, true);
        await act("approve");
        expect((await store.view("team", id, now)).state.phase).toBe("next_planning");
    });
    it("starts only the explicit next plan atomically and reconstructs durable state after recreation", async () => {
        await acceptance();
        await act("approve");
        let view = await store.view("team", id, now);
        await store.context("team", id, "leader", { expectedRevision: view.state.revision, sourceFingerprint: view.state.sourceFingerprint, retrospective: "Improve feedback", nextSprintId: null, reason: "Draft" }, now, true);
        await act("approve");
        const next = sprints.create("team", "leader", { ...plan, name: "Next", startsOn: "2026-10-05", endsOn: "2026-10-11", bufferEndsOn: "2026-10-12" }, now);
        attach("next-task", next.id);
        view = await store.view("team", id, now);
        await store.context("team", id, "leader", { expectedRevision: view.state.revision, sourceFingerprint: view.state.sourceFingerprint, retrospective: view.retrospective, nextSprintId: next.id, reason: "Explicit next scope" }, now, true);
        const input = command(await store.view("team", id, now), "approve");
        expect((await store.decide("team", id, "leader", input, now, true)).outcome).toBe("applied");
        expect(sprints.find("team", id).status).toBe("closed");
        expect(sprints.find("team", next.id).status).toBe("active");
        const restored = new SprintGateStore(sqliteGateDatabase(db));
        expect((await restored.view("team", next.id, now)).state.phase).toBe("implementation");
        expect((await restored.decide("team", id, "leader", input, now, true)).outcome).toBe("applied");
        expect((await restored.view("team", id, now)).tasks.map(t => t.id)).toEqual(["a"]);
        expect((await restored.pending()).map(row => row.sprintId).sort()).toEqual([id, next.id].sort());
    });
    it("does not automatically approve an empty scope or invent a historical approval", async () => {
        expect((await act("approve")).outcome).toBe("rejected");
        db.prepare("UPDATE sprints SET status='active' WHERE id=?").run(id);
        db.prepare("DELETE FROM sprint_gates WHERE sprint_id=?").run(id);
        const legacy = await store.view("team", id, now);
        expect(legacy.state.phase).toBe("implementation");
        expect(legacy.history.every(item => item.action === "observe")).toBe(true);
        migratePlanning(db);
        expect((await store.view("team", id, now)).state).toEqual(legacy.state);
    });
    it("requires explicit rework before changing an already accepted goal", async () => {
        const ready = await acceptance();
        expect(() => sprints.change("team", id, "leader", { action: "update_goal", revision: ready.sprint.revision, goal: "Changed promise", reason: "Scope changed" }, now)).toThrow("差し戻して");
        await act("approve");
        const retrospective = await store.view("team", id, now);
        expect(() => sprints.change("team", id, "leader", { action: "update_goal", revision: retrospective.sprint.revision, goal: "Changed promise", reason: "Scope changed" }, now)).toThrow("差し戻して");
        await act("reject", ["a"]);
        const rejected = await store.view("team", id, now);
        expect(sprints.change("team", id, "leader", { action: "update_goal", revision: rejected.sprint.revision, goal: "Changed promise", reason: "Explicit rework" }, now).goal).toBe("Changed promise");
        expect((await store.view("team", id, now)).state.phase).toBe("implementation");
    });
    it("pins completion evidence even when updated_at is unchanged", async () => {
        const ready = await acceptance();
        db.prepare("UPDATE tasks SET completion_evidence=? WHERE id='a'").run('{"review":"new evidence"}');
        expect((await store.decide("team", id, "leader", command(ready, "approve"), now, true)).outcome).toBe("rejected");
        const refreshed = await store.view("team", id, now);
        expect(refreshed.tasks[0].completionEvidence).toBe('{"review":"new evidence"}');
        expect(refreshed.state.sourceFingerprint).not.toBe(ready.state.sourceFingerprint);
    });
});
