// @spec 自律スプリントの管制 API
import { randomUUID } from "node:crypto";
import { initialSprintPhase } from "@ludiars/terpsichore";
import { PlanningError } from "../planning/contracts.js";
import { assertNoScrumMaster } from "../scrum-master/assignment.js";
import { persist } from "../sprint-gates/persistence.js";
import { exec, one, type GateDatabase, type Program } from "../sprint-gates/query.js";
import { loadGate, loadSprint } from "../sprint-gates/snapshot.js";
import type { ControlInput, LoopRun } from "./contracts.js";
import { assertNoManualExecution } from "./manual-execution.js";
import { assertRevision, changeLoop, findLoop, getLoop, recordLoop } from "./persistence.js";
import { summarizeLoopTasks } from "./tasks.js";

export interface HumanOperator { id: string; admin: boolean }

function* assertOperator(teamId: string, actor: HumanOperator): Program<void> {
  if (actor.admin) return;
  const member = yield* one<{ role: string }>("SELECT role FROM team_members WHERE team_id=? AND user_id=?", teamId, actor.id);
  if (member?.role !== "leader") throw new PlanningError("このチームのリーダー権限がありません", 403);
}

export class AutonomousSprintControl {
  constructor(private readonly db: GateDatabase) {}

  async ownedSprintId(teamId: string): Promise<string | null> {
    return this.db.transaction(teamId, function* () {
      return (yield* findLoop(teamId))?.sprintId ?? null;
    }, { lockTasks: false });
  }

  async read(teamId: string, now: Date, clientId?: string) {
    return this.db.transaction(teamId, function* () {
      const run = clientId === undefined ? yield* findLoop(teamId) : yield* getLoop(teamId, clientId);
      if (!run) return null;
      const { state, snapshot } = yield* loadGate(teamId, run.sprintId);
      const { clientId: _binding, ...stateView } = run;
      return {
        ...stateView,
        phase: state.phase,
        progress: summarizeLoopTasks(snapshot.tasks, run, now),
        retrospective: snapshot.retrospective,
        tasks: clientId === undefined ? [] : snapshot.tasks.map(({ id, projectId, status, executorType }) => ({ id, projectId, status, executorType })),
      };
    });
  }

  async enroll(teamId: string, sprintId: string, clientId: string, stalledAfterMinutes: number, actor: HumanOperator, now: Date): Promise<void> {
    return this.db.transaction(teamId, function* () {
      yield* assertOperator(teamId, actor);
      if (yield* findLoop(teamId)) throw new PlanningError("このチームには自律スプリントが登録済みです", 409);
      yield* assertNoScrumMaster(teamId);
      const gate = yield* loadGate(teamId, sprintId);
      if (gate.snapshot.sprint.status !== "planning" || gate.state.held || gate.state.phase !== "planning") {
        throw new PlanningError("保留されていない計画中のスプリントを選んでください", 409);
      }
      yield* assertNoManualExecution(teamId, gate.snapshot.tasks.map(task => task.id));
      const run: LoopRun = {
        id: randomUUID(), teamId, sprintId, clientId, status: "running", revision: 0, cycle: 1,
        stalledAfterMinutes, nextSprintId: null, claimId: null, taskId: null, claimedAt: null, warning: null,
      };
      yield* exec(`INSERT INTO autonomous_sprint_runs
        (id, team_id, sprint_id, client_id, status, revision, cycle, stalled_after_minutes)
        VALUES(?,?,?,?,'running',0,1,?)`, run.id, teamId, sprintId, clientId, stalledAfterMinutes);
      yield* recordLoop(run, "enroll", actor.id, "チームが自律モードを有効にしました", now);
      yield* persist(gate.row, { ...gate.state, revision: gate.state.revision + 1 },
        { ...gate.snapshot, retrospective: "", nextPlan: null }, "autonomous_enroll", actor.id, "自律モードに切り替えました", now, undefined, "close");
    });
  }

  async control(teamId: string, clientId: string, input: ControlInput, now: Date): Promise<void> {
    return this.db.transaction(teamId, function* () {
      const run = yield* getLoop(teamId, clientId);
      assertRevision(run, input.expectedRevision);
      const actor = `api-client:${clientId}`;
      if (input.action === "policy") {
        if (input.nextSprintId) {
          const current = yield* loadSprint(teamId, run.sprintId);
          const next = yield* loadSprint(teamId, input.nextSprintId);
          if (next.status !== "planning" || next.startsOn <= current.endsOn || next.id === current.id) {
            throw new PlanningError("現スプリントより後の同じチームの計画を選んでください", 409);
          }
        }
        yield* changeLoop(run, { nextSprintId: input.nextSprintId, stalledAfterMinutes: input.stalledAfterMinutes }, input.action, actor, input.reason, now);
        return;
      }
      if (input.action === "reconcile") {
        if (run.status !== "paused" || !run.claimId) throw new PlanningError("保留中の着手許可を確認してください", 409);
        yield* changeLoop(run, { claimId: null, taskId: null, claimedAt: null, warning: null }, input.action, actor, input.reason, now);
        return;
      }
      if (input.action === "resume" && run.warning === "scope_changed") {
        throw new PlanningError("対象変更を確認し、着手許可を照合してから再開してください", 409);
      }
      yield* changeLoop(run, { status: input.action === "resume" ? "running" : "paused",
        warning: input.action === "resume" && run.warning === "client_disabled" ? null : run.warning }, input.action, actor, input.reason, now);
    });
  }

  async manual(teamId: string, sprintId: string, expected: number, action: "pause" | "reconcile" | "release", reason: string, actor: HumanOperator, now: Date): Promise<void> {
    return this.db.transaction(teamId, function* () {
      yield* assertOperator(teamId, actor);
      const run = yield* getLoop(teamId);
      if (run.sprintId !== sprintId) throw new PlanningError("管理対象のスプリントが移行しました", 409);
      assertRevision(run, expected);
      if (action === "pause") {
        yield* changeLoop(run, { status: "paused" }, action, actor.id, reason, now);
        return;
      }
      if (action === "reconcile") {
        if (run.status !== "paused" || !run.claimId) throw new PlanningError("保留中の着手許可を確認してください", 409);
        yield* changeLoop(run, { claimId: null, taskId: null, claimedAt: null, warning: null }, action, actor.id, reason, now);
        return;
      }
      if (run.status !== "paused" || run.claimId) throw new PlanningError("保留し、着手許可を照合してから手動運用に戻してください", 409);
      const gate = yield* loadGate(teamId, run.sprintId);
      const state = initialSprintPhase(run.sprintId, gate.snapshot.sprint.status === "active" ? "implementation" : "planning");
      yield* persist(gate.row, { ...state, revision: gate.state.revision + 1 },
        { ...gate.snapshot, retrospective: "", nextPlan: null }, "autonomous_release", actor.id, reason, now);
      yield* recordLoop({ ...run, revision: run.revision + 1 }, "release", actor.id, reason, now);
      yield* exec("DELETE FROM autonomous_sprint_runs WHERE id=?", run.id);
    });
  }
}
