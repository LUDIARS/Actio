// @spec 自律スプリントの遮断と復旧
import { randomUUID } from "node:crypto";
import { PlanningError } from "../planning/contracts.js";
import { one, type GateDatabase, type Program } from "../sprint-gates/query.js";
import { loadGate } from "../sprint-gates/snapshot.js";
import { AUTONOMOUS_SPRINT_SCOPE } from "./access.js";
import { canAdvanceLoop } from "./advance.js";
import type { BreakerVerdict } from "./breaker.js";
import type { LoopRun } from "./contracts.js";
import { assertNoManualExecution } from "./manual-execution.js";
import { breakerWarning, stepPhase, warnLoop, type Permit, type PermitRequest } from "./phase-step.js";
import { assertRevision, changeLoop, findLoop, getLoop, loopActor, scanLoops } from "./persistence.js";
import { eligibleTask } from "./tasks.js";

export interface ClaimTicket { runId: string; fingerprint: string }

export class AutonomousSprintRunner {
  constructor(private readonly db: GateDatabase) {}

  async candidates(): Promise<LoopRun[]> {
    return this.db.transaction("autonomous-sprint-scan", scanLoops, { lockTasks: false });
  }

  async step(candidate: LoopRun, now: Date, permit?: Permit): Promise<PermitRequest | null> {
    const db = this.db;
    return db.transaction(candidate.teamId, function* () {
      const run = yield* findLoop(candidate.teamId);
      if (!run || run.id !== candidate.id || run.revision !== candidate.revision || run.status !== "running") return null;
      if (!(yield* clientActive(run.clientId, db))) {
        yield* changeLoop(run, { status: "paused", warning: "client_disabled" }, "client_disabled", loopActor(run), "dots 管制クライアントが無効です", now);
        return null;
      }
      return yield* stepPhase(db, run, now, permit);
    });
  }

  async claim(
    teamId: string, clientId: string, revision: number, taskId: string, now: Date,
    check?: ClaimTicket & { verdict: BreakerVerdict },
  ): Promise<{ kind: "prepare"; ticket: ClaimTicket } | { kind: "blocked"; verdict: BreakerVerdict } | { kind: "claimed"; claimId: string }> {
    const db = this.db;
    return db.transaction(teamId, function* () {
      const run = yield* getLoop(teamId, clientId);
      assertRevision(run, revision);
      if (!(yield* clientActive(clientId, db))) throw new PlanningError("dots 管制クライアントが無効です", 403);
      if (run.status !== "running" || run.claimId) throw new PlanningError("進行中で着手許可が未発行のループを選んでください", 409);
      const gate = yield* loadGate(teamId, run.sprintId);
      if (gate.state.held || gate.state.phase !== "implementation" || gate.snapshot.sprint.status !== "active") {
        throw new PlanningError("実装フェーズでのみ着手を許可します", 409);
      }
      const task = yield* eligibleTask(gate.snapshot.tasks, run, taskId);
      yield* assertNoManualExecution(teamId, [taskId]);
      const ticket = { runId: run.id, fingerprint: task.fingerprint };
      if (!check) return { kind: "prepare", ticket };
      if (check.runId !== ticket.runId || check.fingerprint !== ticket.fingerprint) {
        throw new PlanningError("照会中に対象タスクが変更されました", 409);
      }
      if (check.verdict !== "allowed") {
        yield* warnLoop(run, breakerWarning(check.verdict), now);
        return { kind: "blocked", verdict: check.verdict };
      }
      if (!canAdvanceLoop(run.status, "claim_task", check.verdict)) throw new PlanningError("着手許可を発行できません", 409);
      const claimId = randomUUID();
      yield* changeLoop(run, { taskId, claimId, claimedAt: now.toISOString(), warning: null }, "claim", `api-client:${clientId}`, "着手を許可しました", now);
      return { kind: "claimed", claimId };
    });
  }
}

function* clientActive(clientId: string, db: GateDatabase): Program<boolean> {
  // Hold the PostgreSQL credential row through the trigger write so revocation cannot race it.
  const lock = db.rowShareLock ?? "";
  const row = yield* one<{ scopes: unknown }>(`SELECT scopes FROM api_clients WHERE id=? AND is_active=TRUE${lock}`, clientId);
  if (!row) return false;
  try {
    const scopes: unknown = typeof row.scopes === "string" ? JSON.parse(row.scopes) : row.scopes;
    return Array.isArray(scopes) && scopes.includes(AUTONOMOUS_SPRINT_SCOPE);
  } catch {
    return false; // Malformed stored scopes cannot authorize a trigger.
  }
}
