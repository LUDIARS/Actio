import { useEffect, useRef, useState } from "react";
import type { PlanningData, TeamProject } from "../../lib/planning-api";
import { terpsichoreApi, type GuidanceInput, type GuidanceReport, type JudgmentCard } from "../../lib/terpsichore-api";
import { TerpsichoreCheckpoints } from "./TerpsichoreCheckpoints";
import { TerpsichoreDefinitions } from "./TerpsichoreDefinitions";
import { TerpsichoreReport } from "./TerpsichoreReport";
import { TerpsichoreExecution } from "./TerpsichoreExecution";
import "./TerpsichorePanel.css";

interface Props { team: string; sprintId: string; data: PlanningData; projects: TeamProject[]; canEdit: boolean; onRefresh(): Promise<void> }
function normalize(input: GuidanceInput): GuidanceInput {
  return { ...input, goal: { audience: input.goal.audience.trim(), outcome: input.goal.outcome.trim(), successSignal: input.goal.successSignal.trim() },
    definitions: input.definitions.map(d => ({ ...d, acceptance: d.acceptance.map(s => s.trim()).filter(Boolean), outOfScope: d.outOfScope.map(s => s.trim()).filter(Boolean) })),
    deferred: input.deferred.map(s => s.trim()).filter(Boolean) };
}
export function TerpsichorePanel(props: Props) {
  const [projectId, setProjectId] = useState("");
  return <section className="card terpsichore-panel"><h2>テルプシコラ — スクラム支援</h2>
    <label>UX計画の対象プロジェクト<select value={projectId} onChange={e => setProjectId(e.target.value)}><option value="">チーム全体</option>{props.projects.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select></label>
    <GuidanceWorkspace key={`${props.team}:${projectId}:${props.sprintId}`} {...props} projectId={projectId} />
  </section>;
}
function GuidanceWorkspace({ team, projectId, sprintId, data, canEdit, onRefresh }: Props & { projectId: string }) {
  const [input, setInput] = useState<GuidanceInput | null>(null);
  const [report, setReport] = useState<GuidanceReport | null>(null);
  const [revision, setRevision] = useState(0);
  const [cards, setCards] = useState<JudgmentCard[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [evaluated, setEvaluated] = useState("");
  const [saved, setSaved] = useState("");
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void terpsichoreApi.load(team, projectId, sprintId).then(result => {
      if (!active) return;
      setInput(result.input); setReport(result.report); setRevision(result.plan?.revision ?? 0); setEvaluated(result.report ? JSON.stringify(normalize(result.input)) : "");
      setSaved(result.plan ? JSON.stringify(normalize(result.input)) : "");
      if (result.warning) setError(result.warning);
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); });
    return () => { active = false; mounted.current = false; };
  }, [team, projectId, sprintId]);
  const tasks = data.tasks.filter(t => !projectId || t.projectId === projectId);
  const current = input ? normalize(input) : null;
  const isEvaluated = current !== null && evaluated === JSON.stringify(current);
  const update = (patch: Partial<GuidanceInput>) => { if (input) { setInput({ ...input, ...patch }); setNotice(""); setCards([]); } };
  const act = async (action: "assess" | "save" | "advice") => {
    if (!current || (action === "save" && !report)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      if (action === "advice") {
        const result = await terpsichoreApi.advice(team, current);
        if (mounted.current) { setCards(result.cards); if (!result.cards.length) setNotice("関連する判断カードは見つかりませんでした。"); }
      } else if (action === "save" && report) {
        const result = await terpsichoreApi.save(team, current, revision, report.sourceFingerprint);
        if (mounted.current) { setRevision(result.plan.revision); setReport(result.report); setSaved(JSON.stringify(current)); setNotice("支援計画を保存しました。"); }
      } else {
        const result = await terpsichoreApi.assess(team, current);
        await onRefresh();
        if (mounted.current) { setReport(result.report); setEvaluated(JSON.stringify(current)); setCards([]); }
      }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "処理に失敗しました"); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {input && <>
      <p>計画の範囲: {sprintId ? data.sprints.find(s => s.id === sprintId)?.name : "稼働中・計画中の全スプリント"}。スプリント容量はチーム全体で評価します。</p>
      <fieldset disabled={busy || !canEdit} className="planning-form"><legend>UXゴール</legend>
        <label>誰のためか<input maxLength={4000} value={input.goal.audience} onChange={e => update({ goal: { ...input.goal, audience: e.target.value } })} /></label>
        <label>どんな体験・変化を届けるか<textarea maxLength={4000} value={input.goal.outcome} onChange={e => update({ goal: { ...input.goal, outcome: e.target.value } })} /></label>
        <label>何を観測できれば達成か<textarea maxLength={4000} value={input.goal.successSignal} onChange={e => update({ goal: { ...input.goal, successSignal: e.target.value } })} /></label>
        <label>更新なしを確認する日数<input type="number" min={1} max={90} value={input.staleDays} onChange={e => update({ staleDays: Number(e.target.value) })} /></label>
      </fieldset>
      <details><summary>タスクの定義案を整える</summary><TerpsichoreDefinitions definitions={input.definitions} tasks={tasks} disabled={busy || !canEdit} onChange={definitions => update({ definitions })} /></details>
      <details><summary>暫定完成とUXゴールへの道筋を編集</summary><TerpsichoreCheckpoints checkpoints={input.checkpoints} tasks={tasks} disabled={busy || !canEdit} onChange={checkpoints => update({ checkpoints })} /></details>
      <label>今回残す課題（1行に1項目）<textarea disabled={busy || !canEdit} value={input.deferred.join("\n")} onChange={e => update({ deferred: e.target.value.split("\n") })} /></label>
      <div className="terpsichore-actions"><button className="btn" disabled={busy} onClick={() => void act("assess")}>最新状況で評価</button>
        {canEdit && <><button className="btn" disabled={busy || !isEvaluated} onClick={() => void act("save")}>支援計画を保存</button><button className="btn" disabled={busy || !isEvaluated} onClick={() => void act("advice")}>Geniusの判断を参照</button></>}
      </div>
      {!isEvaluated && <p role="status">定義を変更しました。再評価すると結果を更新できます。</p>}
      {report && isEvaluated && <TerpsichoreReport report={report} cards={cards} />}
      <TerpsichoreExecution key={`${projectId}:${revision}`} team={team} projectId={projectId} revision={revision} canEdit={canEdit}
        enabled={!busy && !sprintId && !!projectId && isEvaluated && saved === JSON.stringify(current)} />
    </>}
    {busy && <p role="status">処理中…</p>}
  </>;
}
