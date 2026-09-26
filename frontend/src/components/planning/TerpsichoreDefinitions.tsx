import { useState } from "react";
import type { GuidanceInput } from "../../lib/terpsichore-api";
import type { PlanningTask } from "../../lib/planning-api";

interface Props { definitions: GuidanceInput["definitions"]; tasks: PlanningTask[]; disabled: boolean; onChange(value: GuidanceInput["definitions"]): void }
export function TerpsichoreDefinitions({ definitions, tasks, disabled, onChange }: Props) {
  const [taskId, setTaskId] = useState("");
  const task = tasks.find(t => t.id === taskId);
  const value = definitions.find(d => d.taskId === taskId) ?? { taskId, outcome: task?.description ?? "", acceptance: task?.requirements ? [task.requirements] : [], outOfScope: [] };
  const update = (patch: Partial<typeof value>) => onChange([...definitions.filter(d => d.taskId !== taskId), { ...value, ...patch }]);
  return <fieldset disabled={disabled}><legend>バックログ定義の補佐</legend>
    {definitions.filter(d => !tasks.some(t => t.id === d.taskId)).map(d => <p key={d.taskId}>参照できないタスク: {d.taskId} <button type="button" className="btn btn-sm" onClick={() => onChange(definitions.filter(item => item.taskId !== d.taskId))}>計画から定義案を外す</button></p>)}
    <label>タスク<select value={taskId} onChange={e => setTaskId(e.target.value)}><option value="">タスクを選ぶ</option>{tasks.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></label>
    {task && <>
      <label>届けたい変化・目的<textarea maxLength={4000} value={value.outcome} onChange={e => update({ outcome: e.target.value })} /></label>
      <label>受入条件（1行に1条件）<textarea value={value.acceptance.join("\n")} onChange={e => update({ acceptance: e.target.value.split("\n") })} /></label>
      <label>今回の対象外（1行に1項目）<textarea value={value.outOfScope.join("\n")} onChange={e => update({ outOfScope: e.target.value.split("\n") })} /></label>
      <p>支援計画の定義案として保存します。評価結果の原案を既存タスクの要件へ転記できます。</p>
    </>}
  </fieldset>;
}
