// @spec スプリントフェーズのAPIと画面契約
import { useState, type FormEvent } from "react";
import type { SprintPhase } from "@ludiars/terpsichore/types";
import type { Sprint, TeamProject } from "../../lib/planning-api";
import type { SprintHumanDecision } from "../../lib/sprint-phase-api";
import { useAuth } from "../../contexts/AuthContext";
import { useSprintPhase } from "./useSprintPhase";
import { SprintPhaseEvidence } from "./SprintPhaseEvidence";
import { SprintNextPlan } from "./SprintNextPlan";
import "./SprintPhasePanel.css";

const phases: { id: SprintPhase; label: string; guidance: string; approval: string }[] = [
  { id: "planning", label: "計画", guidance: "目標・対象・期間・容量を確認し、人間の承認で開始します。", approval: "この計画を承認して実装を開始" },
  { id: "implementation", label: "実装", guidance: "対象バックログ全件の実装完了を待っています。途中の相談や保留もできます。", approval: "" },
  { id: "acceptance", label: "受入確認", guidance: "実装が完了しました。人間による受入確認を待っています。未達の場合は同じスプリントへ差し戻してください。", approval: "受入を承認して振り返りへ" },
  { id: "retrospective", label: "振り返り", guidance: "成果・未達・学び・改善を記録し、人間が内容を確定します。", approval: "振り返りを確定して次計画へ" },
  { id: "next_planning", label: "次スプリント計画", guidance: "次の目標・対象・期間・容量を選び、人間が次スプリントの開始を承認します。", approval: "現スプリントを終了し、表示の次計画を開始" },
];
const phaseLabel = (phase: string): string => phases.find(item => item.id === phase)?.label ?? phase;
const actionLabel: Record<string, string> = { observe: "進捗確認", context: "確認内容を保存", approve: "承認", reject: "差し戻し", hold: "保留", resume: "保留を解除", resubmit: "再提出" };
const deliveryLabel = { pending: "Ccへ通知待ち", delivered: "Ccへ通知済み", failed: "Ccへの通知に失敗", unknown: "Ccへの通知結果を確認中" };
function discordThread(value: string | null): string | null {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === "https:" && ["discord.com", "discordapp.com"].includes(url.hostname) && url.pathname.startsWith("/channels/") ? url.href : null; }
  catch { return null; }
}
interface Props {
  team: string; sprintId: string; sprints: Sprint[]; projects: TeamProject[]; onChanged(): Promise<void>;
}
export function SprintPhasePanel(props: Props) {
  const { user } = useAuth();
  const ownerId = user?.id ?? "signed-out";
  return <SprintPhaseWorkspace key={`${ownerId}:${props.team}:${props.sprintId}`} {...props} ownerId={ownerId} />;
}
function SprintPhaseWorkspace({ ownerId, team, sprintId, sprints, projects, onChanged }: Props & { ownerId: string }) {
  const workspace = useSprintPhase(ownerId, team, sprintId, onChanged);
  const { view, busy, dirty, pending } = workspace;
  const [reason, setReason] = useState("");
  const [contextReason, setContextReason] = useState("");
  const [action, setAction] = useState<SprintHumanDecision["action"] | "">("");
  const [actionRevision, setActionRevision] = useState(-1);
  const [taskIds, setTaskIds] = useState<string[]>([]);
  if (!view) return <section className="card sprint-phase-panel"><h2>スプリントの進行と人間の判断</h2>
    {workspace.error && <p role="alert">{workspace.error}</p>}
    <button className="btn" disabled={busy} onClick={() => void workspace.refresh()}>最新状態を読み込む</button>
    {busy && <p role="status">読み込んでいます…</p>}
  </section>;
  const current = phases.find(item => item.id === view.state.phase);
  const closed = view.sprint.status === "closed";
  const editable = view.allowedToDecide && !closed;
  const locked = busy || !!pending || !editable;
  const thread = discordThread(view.delivery.threadUrl);
  const later = ["retrospective", "next_planning"].includes(view.state.phase);
  const actions: { id: SprintHumanDecision["action"]; label: string }[] = [];
  if (!view.state.held && current?.approval) actions.push({ id: "approve", label: current.approval });
  actions.push({ id: "reject", label: view.state.phase === "planning" ? "計画の修正を依頼" : "未達を同じスプリントの実装へ差し戻す" });
  actions.push(view.state.held ? { id: "resume", label: "保留を解除する（承認はしない）" } : { id: "hold", label: "進行を保留する" });
  if (view.state.phase === "implementation" && view.state.reworkTaskIds.length > 0 && !view.state.held) actions.push({ id: "resubmit", label: "修正した実装を受入確認へ再提出" });
  const selectedAction = actionRevision === view.state.revision ? actions.find(item => item.id === action) : undefined;
  const rejection = selectedAction?.id === "reject" && view.state.phase !== "planning";
  const validTargets = taskIds.length > 0 && taskIds.every(id => view.tasks.some(task => task.id === id));
  const nextReady = view.nextPlan?.complete && view.nextPlan.tasks.length > 0 && view.nextPlan.sprint.status === "planning";
  const planReady = view.complete && view.tasks.length > 0 && !!view.sprint.goal?.trim() && !!view.sprint.capacityMinutes;
  const missingContext = action === "approve" && ((view.state.phase === "planning" && !planReady)
    || (view.state.phase === "retrospective" && !view.retrospective.trim())
    || (view.state.phase === "next_planning" && !nextReady));
  const reworkIncomplete = action === "resubmit" && (!view.complete || view.tasks.length === 0 || view.tasks.some(task => task.status !== "done")
    || view.state.reworkTaskIds.some(id => !view.tasks.some(task => task.id === id)));
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (selectedAction && (!rejection || validTargets) && !missingContext && !reworkIncomplete) void workspace.decide(selectedAction.id, reason, rejection ? taskIds : undefined);
  };
  return <section className="card sprint-phase-panel" aria-label="スプリントの進行と人間の判断">
    <header><h2>スプリントの進行と人間の判断</h2><button className="btn" disabled={busy} onClick={() => void workspace.refresh()}>最新状態を確認</button></header>
    <ol className="sprint-phase-steps" aria-label="スプリントのフェーズ">{phases.map(item => <li key={item.id} aria-current={!closed && item.id === view.state.phase ? "step" : undefined}>{item.label}</li>)}</ol>
    <p role="status"><strong>{closed ? "このスプリントは終了しました" : `${current?.label}${view.state.held ? "（保留中）" : ""}`}</strong> ／確認する版 {view.state.revision}</p>
    {!closed && <p>{view.state.held ? "進行は保留中です。再開するには明示的に保留を解除してください。" : current?.guidance}</p>}
    {workspace.error && <p role="alert">{workspace.error}</p>}
    {workspace.notice && <p role="status">{workspace.notice}</p>}
    <div className="sprint-phase-delivery"><p>{deliveryLabel[view.delivery.status]}</p>
      {thread && <a className="btn" href={thread} target="_blank" rel="noopener noreferrer">Ccで相談・判断する</a>}
      <p>各フェーズの相談は同じCcスレッドに残ります。会話だけでは承認されません。</p>
      {view.delivery.lastError && <p role="alert">{view.delivery.lastError}</p>}
      {view.delivery.threadUrl && !thread && <p role="alert">Ccの会話リンクを確認できません。通知の状態を再確認してください。</p>}
    </div>
    <SprintPhaseEvidence sprint={view.sprint} tasks={view.tasks} complete={view.complete} projects={projects} />
    {view.state.reworkTaskIds.length > 0 && <div className="sprint-phase-rework"><h3>再提出が必要な対象</h3>
      <ul>{view.state.reworkTaskIds.map(id => <li key={id}>{view.tasks.find(task => task.id === id)?.title ?? `${id}（現在の対象にありません）`}</li>)}</ul>
      <p>実装を修正し、対象全件の完了を確認してから理由を添えて再提出してください。</p>
    </div>}
    {(later || dirty || !!view.retrospective || !!view.nextSprintId) && <form className="planning-form" onSubmit={event => { event.preventDefault(); void workspace.saveContext(contextReason); }}>
      <h3>振り返りと次計画の確認内容</h3>
      <label>成果・未達・学び・改善<textarea rows={5} maxLength={20000} disabled={locked} value={workspace.retrospective} onChange={event => workspace.editRetrospective(event.target.value)} /></label>
      <SprintNextPlan team={team} currentId={sprintId} selectedId={workspace.nextSprintId} savedPlan={view.nextPlan} sprints={sprints} projects={projects} disabled={locked} onChange={workspace.editNextSprint} />
      {editable && <><label>内容を更新する理由<textarea value={contextReason} maxLength={4000} required disabled={locked} onChange={event => setContextReason(event.target.value)} /></label>
        <button className="btn" disabled={locked || !dirty || !contextReason.trim()}>確認内容を保存</button>
        {dirty && <button type="button" className="btn" disabled={locked} onClick={workspace.discardDraft}>編集中の変更を取り消す</button>}</>}
      {dirty && <p role="status">未保存の内容があります。保存して確認するまで、フェーズの判断は送信できません。</p>}
    </form>}
    {!view.allowedToDecide && !closed && <p>人間のCernereアカウントでログインして判断してください。このチームの判断権限も必要です。Ccの相談スレッドからも確認できます。</p>}
    {pending && <section className="sprint-phase-pending" aria-label="結果未確認の判断"><h3>送信した判断の結果を確認してください</h3>
      <p>{actionLabel[pending.action]} ／確認する版 {pending.expectedRevision}</p><p>{pending.reason}</p>
      <p>新しい判断は送信できません。同じ内容の再送は一度の判断として扱われます。</p>
      <button className="btn" disabled={busy} onClick={() => void workspace.retry()}>同じ判断の結果を確認・再送</button>
    </section>}
    {editable && <form className="planning-form" onSubmit={submit}><h3>この版に対する人間の判断</h3>
      <fieldset disabled={locked || dirty}><legend>確認する版 {view.state.revision}</legend>
        <label>判断<select value={selectedAction ? action : ""} required onChange={event => { setAction(event.target.value as SprintHumanDecision["action"] | ""); setActionRevision(view.state.revision); }}>
          <option value="">判断を選択</option>{actions.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
        </select></label>
        {rejection && <fieldset><legend>未達の対象（1件以上）</legend>{view.tasks.map(task => <label className="sprint-phase-checkbox" key={task.id}>
          <input type="checkbox" checked={taskIds.includes(task.id)} onChange={event => setTaskIds(previous => event.target.checked ? [...previous, task.id] : previous.filter(id => id !== task.id))} />{task.title}
        </label>)}<p>差し戻しても期数・期間は進みません。次スプリントも開始しません。</p></fieldset>}
        <label>判断の理由<textarea maxLength={4000} required value={reason} onChange={event => setReason(event.target.value)} /></label>
        {missingContext && <p>計画の目標・容量・対象、または振り返りの必須内容を保存し、対象を確認してください。</p>}
        {reworkIncomplete && <p>差し戻した対象を含む全件の実装完了が必要です。</p>}
        <button className="btn btn-primary" disabled={!selectedAction || !reason.trim() || missingContext || reworkIncomplete || (rejection && !validTargets)}>{selectedAction ? `${selectedAction.label} — 確定` : "判断を選択してください"}</button>
      </fieldset>
    </form>}
    <details><summary>フェーズと判断の履歴（{view.history.length}件）</summary>
      <ol className="sprint-phase-history">{view.history.map(item => <li key={item.eventId}>
        <p>{item.createdAt} ／ {actionLabel[item.action] ?? item.action} → {phaseLabel(item.phase)}（版 {item.revision}）</p>
        <p>{item.reason}</p><p>{item.actorId ? "人間の判断" : "進捗の自動確認"}</p>
      </li>)}</ol>
    </details>
    {busy && <p role="status">処理中…</p>}
  </section>;
}
