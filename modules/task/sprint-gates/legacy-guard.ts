// @spec スプリントフェーズの不変条件
import { sprintPhaseState } from "@ludiars/terpsichore";
import { PlanningError } from "../planning/contracts.js";
/** Once acceptance started, changing the promised outcome requires an explicit human rejection first. */
export function assertGoalEditable(status: string, stateJson: string | undefined): void {
    if (status === "planning")
        return;
    if (status === "active" && (!stateJson || sprintPhaseState.parse(JSON.parse(stateJson)).phase === "implementation"))
        return;
    throw new PlanningError("受入確認以降のゴール変更は、フェーズ画面で差し戻してから行ってください");
}
