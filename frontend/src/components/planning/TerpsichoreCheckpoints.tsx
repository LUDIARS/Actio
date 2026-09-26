import type { GuidanceInput } from "../../lib/terpsichore-api";
import type { PlanningTask } from "../../lib/planning-api";

type Checkpoint = GuidanceInput["checkpoints"][number];
interface Props { checkpoints: Checkpoint[]; tasks: PlanningTask[]; disabled: boolean; onChange(value: Checkpoint[]): void }
export function TerpsichoreCheckpoints({ checkpoints, tasks, disabled, onChange }: Props) {
  const update = (index: number, patch: Partial<Checkpoint>) => onChange(checkpoints.map((c, i) => i === index ? { ...c, ...patch } : c));
  return <fieldset disabled={disabled} className="terpsichore-checkpoints"><legend>暫定完成からUXゴールへの道筋</legend>
    <p>各到達点にタスクと確認シナリオを結びます。タスクが完了しても、体験の確認証拠が揃うまでは達成になりません。</p>
    {checkpoints.map((point, index) => <fieldset key={point.id}><legend>{index + 1}. {point.title || "新しい到達点"}</legend>
      <label>到達点<input maxLength={4000} value={point.title} onChange={e => update(index, { title: e.target.value })} /></label>
      <label>段階<select value={point.phase} onChange={e => update(index, { phase: e.target.value as Checkpoint["phase"] })}><option value="provisional">今回の暫定完成</option><option value="ux">UXゴール</option></select></label>
      <label>対応タスク（複数選択可）<select multiple value={point.taskIds} onChange={e => update(index, { taskIds: [...e.target.selectedOptions].map(o => o.value), taskFingerprints: {} })}>
        {tasks.map(t => <option key={t.id} value={t.id}>{t.title} ({t.status})</option>)}
      </select></label>
      {point.taskIds.filter(id => !tasks.some(t => t.id === id)).map(id => <p key={id}>参照できないタスク: {id} <button type="button" className="btn btn-sm" onClick={() => update(index, { taskIds: point.taskIds.filter(taskId => taskId !== id), taskFingerprints: {} })}>到達点から外す</button></p>)}
      <label>先に達成する到達点（複数選択可）<select multiple value={point.dependsOn} onChange={e => update(index, { dependsOn: [...e.target.selectedOptions].map(o => o.value) })}>
        {checkpoints.filter(p => p.id !== point.id).map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
      </select></label>
      {point.criteria.map((criterion, ci) => <div className="terpsichore-criterion" key={ci}>
        <label>確認シナリオと期待結果<textarea maxLength={4000} value={criterion.text} onChange={e => update(index, { criteria: point.criteria.map((c, i) => i === ci ? { ...c, text: e.target.value, verified: false } : c) })} /></label>
        <label>確認証拠（記録・成果物への参照）<input maxLength={4000} value={criterion.evidence} onChange={e => update(index, { criteria: point.criteria.map((c, i) => i === ci ? { ...c, evidence: e.target.value, verified: false } : c) })} /></label>
        <label className="terpsichore-inline"><input type="checkbox" checked={criterion.verified} disabled={!criterion.evidence.trim()} onChange={e => update(index, {
          criteria: point.criteria.map((c, i) => i === ci ? { ...c, verified: e.target.checked }
            : point.taskIds.some(id => point.taskFingerprints[id] !== tasks.find(t => t.id === id)?.fingerprint) ? { ...c, verified: false } : c),
          taskFingerprints: Object.fromEntries(tasks.filter(t => point.taskIds.includes(t.id)).map(t => [t.id, t.fingerprint])),
        })} />現在の成果物で確認済み</label>
        <button type="button" className="btn btn-sm" onClick={() => update(index, { criteria: point.criteria.filter((_, i) => i !== ci) })}>条件を削除</button>
      </div>)}
      <button type="button" className="btn btn-sm" disabled={point.criteria.length >= 50} onClick={() => update(index, { criteria: [...point.criteria, { text: "", verified: false, evidence: "" }] })}>確認条件を追加</button>
      <button type="button" className="btn btn-sm" onClick={() => onChange(checkpoints.filter((_, i) => i !== index).map(c => ({ ...c, dependsOn: c.dependsOn.filter(id => id !== point.id) })))}>到達点を削除</button>
    </fieldset>)}
    <button type="button" className="btn" disabled={checkpoints.length >= 50} onClick={() => onChange([...checkpoints, { id: crypto.randomUUID(), title: "新しい到達点", phase: checkpoints.length ? "ux" : "provisional", taskIds: [], dependsOn: [], criteria: [], taskFingerprints: {} }])}>到達点を追加</button>
  </fieldset>;
}
