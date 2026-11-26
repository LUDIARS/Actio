// @spec スクラムマスターの役割と権限
import { PlanningError } from "../planning/contracts.js";
import { one, type Program } from "../sprint-gates/query.js";
import type { ScrumMasterAssignment } from "./contracts.js";

export function* findScrumMaster(teamId: string, lock = ""): Program<ScrumMasterAssignment | undefined> {
  return yield* one<ScrumMasterAssignment>(`SELECT holder, client_id AS clientId, assigned_by AS assignedBy,
    assigned_at AS assignedAt FROM sprint_scrum_masters WHERE team_id=?${lock}`, teamId);
}

/** 自律スプリントと併用しないための確認。判断する AI をチームごとに一つに保つ。 */
export function* assertNoScrumMaster(teamId: string): Program<void> {
  if (yield* findScrumMaster(teamId)) {
    throw new PlanningError("スクラムマスターを割り当てたチームは自律モードを併用できません。割当を外してください", 409);
  }
}
