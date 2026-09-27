// @implements AT-SPRINT-CHAT-INTEGRATION
import type { GateView } from "../sprint-gates/contracts.js";

export function localClock(now: Date, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const get = (kind: string): string => parts.find(p => p.type === kind)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
export function sprintSummary(view: GateView, webUrl: string, heading: string): string {
  const sprint = view.sprint;
  return [heading, `${sprint.name} / ${view.state.phase}`, `目標: ${sprint.goal || "未設定"}`,
    `期間: ${sprint.startsOn} 〜 ${sprint.endsOn}`, `期日: ${sprint.endsOn}`,
    `タスク一覧 (${view.tasks.length}件):`, ...view.tasks.map(task => {
      const deadline = task.deadline === null || task.deadline === undefined ? "未設定" : new Date(task.deadline * 1000).toISOString().slice(0, 10);
      return `・[${task.status}] ${task.title} / 担当: ${task.assigneeId || "未設定"} / 期日: ${deadline}\n  完了証跡: ${task.completionEvidence || "未記入"}`;
    }), "直近のレビュー・評価・判断:", ...view.history.slice(0, 5).map(h => `・${h.phase} / ${h.action}: ${h.reason}`),
    `振り返り: ${view.retrospective || "未記入"}`, `確認・操作: ${webUrl}/tasks/planning?teamId=${encodeURIComponent(sprint.teamId)}&sprintId=${encodeURIComponent(sprint.id)}`,
  ].join("\n");
}
