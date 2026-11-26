// @spec スクラムマスターの役割と権限
import { randomUUID } from "node:crypto";
import { findLoop } from "../autonomous-sprint/persistence.js";
import { PlanningError } from "../planning/contracts.js";
import type { DelegatedAuthority, DelegatedChange } from "../sprint-gates/authority.js";
import { exec, one, type GateDatabase, type Program } from "../sprint-gates/query.js";
import { findScrumMaster } from "./assignment.js";
import {
  SCRUM_MASTER_ACTOR, SCRUM_MASTER_HOLDER, SCRUM_MASTER_SCOPE,
  type ScrumMasterAssignment, type ScrumMasterPrincipal,
} from "./contracts.js";

export class ScrumMasterStore {
  constructor(private readonly db: GateDatabase) {}

  async read(teamId: string): Promise<ScrumMasterAssignment | null> {
    return this.db.transaction(teamId, function* () {
      return (yield* findScrumMaster(teamId)) ?? null;
    }, { lockTasks: false });
  }

  async assign(teamId: string, clientId: string | null, actor: string, now: Date): Promise<void> {
    return this.db.transaction(teamId, function* () {
      if (yield* findLoop(teamId)) {
        throw new PlanningError("自律モードのチームには割り当てられません。手動運用に戻してください", 409);
      }
      yield* exec(`INSERT INTO sprint_scrum_masters(team_id,holder,client_id,assigned_by,assigned_at) VALUES(?,?,?,?,?)
        ON CONFLICT(team_id) DO UPDATE SET holder=excluded.holder,client_id=excluded.client_id,
          assigned_by=excluded.assigned_by,assigned_at=excluded.assigned_at`,
      teamId, SCRUM_MASTER_HOLDER, clientId, actor, now.toISOString());
      yield* record(teamId, null, "assign", actor, null, now);
    }, { lockTasks: false });
  }

  async remove(teamId: string, actor: string, now: Date): Promise<void> {
    return this.db.transaction(teamId, function* () {
      if (!(yield* findScrumMaster(teamId))) throw new PlanningError("スクラムマスターは割り当てられていません", 404);
      yield* exec("DELETE FROM sprint_scrum_masters WHERE team_id=?", teamId);
      yield* record(teamId, null, "remove", actor, null, now);
    }, { lockTasks: false });
  }

  async verify(teamId: string, principal: ScrumMasterPrincipal): Promise<void> {
    const db = this.db;
    return db.transaction(teamId, function* () {
      yield* requireRole(db, teamId, principal);
    }, { lockTasks: false });
  }

  /**
   * フェーズ操作の委任条件。`startPermitted` は Concordia のサーキットブレーカーが
   * この要求の開始を許可したときだけ true にする。
   */
  authority(teamId: string, principal: ScrumMasterPrincipal, startPermitted: boolean, now: Date): DelegatedAuthority {
    const db = this.db;
    return {
      authorize: () => requireRole(db, teamId, principal),
      *permit(sprintId: string, change: DelegatedChange): Program<void> {
        if (change.held && (yield* lastHoldActor(teamId, sprintId)) !== SCRUM_MASTER_ACTOR) {
          throw new PlanningError("人が保留したスプリントはスクラムマスターが操作できません。人の保留解除を待ってください", 409);
        }
        if (change.effect !== "none" && !startPermitted) {
          throw new PlanningError("Concordia の許可を確認していないため開始できません。最新の状態を読み直してください", 409);
        }
        yield* record(teamId, sprintId, change.action, principal.actor, change.eventId, now);
      },
    };
  }

  /** 遮断・確認不能で開始を見送った事実を残す。 */
  async recordBlocked(teamId: string, sprintId: string, verdict: "open" | "unavailable", actor: string, now: Date): Promise<void> {
    return this.db.transaction(teamId, function* () {
      yield* record(teamId, sprintId, `breaker_${verdict}`, actor, null, now);
    }, { lockTasks: false });
  }
}

function* requireRole(db: GateDatabase, teamId: string, principal: ScrumMasterPrincipal): Program<void> {
  // PostgreSQL では割当と資格情報の行を保持し、判断中の取り外し・失効と競合させない。
  const lock = db.rowShareLock ?? "";
  const assignment = yield* findScrumMaster(teamId, lock);
  if (!assignment || assignment.clientId !== principal.clientId) {
    throw new PlanningError("このチームのスクラムマスターに割り当てられていません", 403);
  }
  if (principal.clientId === null) return;
  const client = yield* one<{ scopes: unknown }>(`SELECT scopes FROM api_clients WHERE id=? AND is_active=TRUE${lock}`, principal.clientId);
  if (!client || !hasScope(client.scopes)) throw new PlanningError("スクラムマスター用の API クライアントが無効です", 403);
}

function hasScope(raw: unknown): boolean {
  try {
    const scopes: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(scopes) && scopes.includes(SCRUM_MASTER_SCOPE);
  } catch {
    return false; // 壊れた scope は権限の根拠にしない。
  }
}

function* lastHoldActor(teamId: string, sprintId: string): Program<string | null> {
  const row = yield* one<{ actorId: string | null }>(`SELECT actor_id AS actorId FROM sprint_gate_history
    WHERE team_id=? AND sprint_id=? AND action='hold' ORDER BY revision DESC LIMIT 1`, teamId, sprintId);
  return row?.actorId ?? null;
}

function* record(
  teamId: string, sprintId: string | null, action: string, actor: string, gateEventId: string | null, now: Date,
): Program<void> {
  yield* exec(`INSERT INTO sprint_scrum_master_events(id,team_id,sprint_id,action,actor_id,gate_event_id,created_at)
    VALUES(?,?,?,?,?,?,?)`, randomUUID(), teamId, sprintId, action, actor, gateEventId, now.toISOString());
}
