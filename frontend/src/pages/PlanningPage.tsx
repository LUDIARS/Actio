import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { planningApi, type CurrentSprintView, type PlanningData, type PlanningTask, type Team, type TeamProject } from "../lib/planning-api";

type BoardView = "current" | "all";

function executorText(task: PlanningTask): string {
  if (task.executorType !== "ai") return "人間";
  return task.aiExecutor ? `AI: ${task.aiExecutor}` : "AI (未割り当て)";
}

function criticalPathText(task: PlanningTask): string {
  if (task.criticalPathError === "cycle") return "依存が循環しています";
  if (task.isCriticalPath) return "★ クリティカルパス";
  return task.slackDays != null ? `余裕 ${task.slackDays} 日` : "—";
}
import { request } from "../lib/api";
import { SprintForm, SprintAdjustment } from "../components/planning/SprintForm";
import { PraeformaBacklog } from "../components/planning/PraeformaBacklog";
import { TerpsichorePanel } from "../components/planning/TerpsichorePanel";
import "./PlanningPage.css";

export function PlanningPage() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [team, setTeam] = useState("");
  const currentTeam = useRef(team);
  currentTeam.current = team;
  const [data, setData] = useState<PlanningData | null>(null);
  const [members, setMembers] = useState<string[]>([]);
  const [sprintId, setSprintId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [history, setHistory] = useState<Awaited<ReturnType<typeof planningApi.history>>["changes"]>([]);
  const [view, setView] = useState<BoardView>("current");
  const [current, setCurrent] = useState<CurrentSprintView | null>(null);
  const [projects, setProjects] = useState<TeamProject[]>([]);
  const [executorType, setExecutorType] = useState<"human" | "ai">("human");
  useEffect(() => { let active = true; void planningApi.teams().then(r => { if (active) setTeams(r.teams); }).catch(e => { if (active) setError(e.message); }); return () => { active = false; }; }, []);
  const refresh = useCallback(async () => {
    if (!team) return;
    const [result, currentView] = await Promise.all([planningApi.load(team), planningApi.currentView(team)]);
    if (currentTeam.current !== team) return;
    setData(result); setCurrent(currentView); setSelected([]); setHistory([]);
  }, [team]);
  useEffect(() => {
    let active = true; setData(null); setCurrent(null); setProjects([]); setSelected([]); setSprintId(""); setHistory([]); setMembers([]); setError("");
    if (team) { setBusy(true); void Promise.all([planningApi.load(team), planningApi.members(team), planningApi.currentView(team), planningApi.teamProjects(team)]).then(([d, m, cv, p]) => {
      if (active) { setData(d); setMembers(m.members.map(x => x.userId)); setCurrent(cv); setProjects(p.projects); }
    }).catch(e => { if (active) setError(e.message); }).finally(() => { if (active) setBusy(false); }); }
    return () => { active = false; };
  }, [team]);
  const currentIds = new Set(current?.tasks.map(t => t.id) ?? []);
  const visibleTasks = data ? (view === "current" && current ? data.tasks.filter(t => currentIds.has(t.id)) : data.tasks) : [];
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setError("");
    try { await fn(); await refresh(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const canEdit = ["leader", "admin"].includes(teams.find(t => t.id === team)?.role ?? "");
  const sprint = data?.sprints.find(s => s.id === sprintId);
  const group = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    void run(() => planningApi.mutate(team, "/groups", { name: form.get("name"), reason: form.get("reason"),
      tasks: data?.tasks.filter(t => selected.includes(t.id)).map(t => ({ id: t.id, fingerprint: t.fingerprint })) }));
  };
  const createTask = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const form = event.currentTarget; const values = new FormData(form);
    const aiExecutor = String(values.get("aiExecutor") ?? "").trim();
    const projectId = String(values.get("projectId") ?? "");
    void run(async () => { await request("/tasks", { method: "POST", body: JSON.stringify({ teamId: team, lane: "backlog",
      title: values.get("title"), description: values.get("description"), assigneeId: values.get("assigneeId"),
      deadline: new Date(String(values.get("deadline"))).toISOString(), estimatedMinutes: Number(values.get("estimatedMinutes")),
      executorType, ...(executorType === "ai" && aiExecutor ? { aiExecutor } : {}), ...(projectId ? { projectId } : {}),
    }) }); form.reset(); setExecutorType("human"); });
  };
  return <div className="page-container planning-page">
    <h1>バックログとスプリント</h1>
    <label>チーム<select value={team} disabled={busy} onChange={e => setTeam(e.target.value)}><option value="">チームを選択</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name ?? t.id}</option>)}</select></label>
    {teams.length === 0 && <p>所属チームがありません。チーム同期とメンバー登録を確認してください。</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <TerpsichorePanel key={team} team={team} sprintId={sprintId} data={data} projects={projects} canEdit={canEdit} onRefresh={refresh} />
      {canEdit && <><SprintForm key={`sprint-${team}`} team={team} onSaved={refresh} /><PraeformaBacklog key={`pf-${team}`} team={team} members={members} onSaved={refresh} />
        <details><summary>バックログを追加</summary><form className="planning-form" onSubmit={createTask}>
          <label>タイトル<input name="title" required /></label><label>内容<textarea name="description" /></label>
          <label>担当者<select name="assigneeId" required><option value="">選択</option>{members.map(m => <option key={m}>{m}</option>)}</select></label>
          <label>締め切り<input name="deadline" type="datetime-local" required /></label><label>見積工数（分）<input name="estimatedMinutes" type="number" min="1" required /></label>
          <label>作業者<select name="executorType" value={executorType} onChange={e => setExecutorType(e.target.value as "human" | "ai")}><option value="human">人間</option><option value="ai">AI</option></select></label>
          {executorType === "ai" && <label>AI 実行者（任意）<input name="aiExecutor" placeholder="例: codex/impl-from-design" pattern="[A-Za-z0-9._:/@-]{1,128}" /></label>}
          <label>プロジェクト（任意）<select name="projectId" defaultValue=""><option value="">なし</option>{projects.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}</select></label>
          <p>AI が作業するタスクでも、担当者は結果を確認する責任者です。</p>
          <button className="btn" disabled={busy}>追加</button>
        </form></details></>}
      <label>表示<select value={view} onChange={e => setView(e.target.value as BoardView)}><option value="current">現在のスプリントとバックログ</option><option value="all">すべて</option></select></label>
      {view === "current" && current && <p role="status">{current.current_sprint
        ? `進行中のスプリント: ${current.current_sprint.name}（${current.current_sprint.startsOn} ～ ${current.current_sprint.endsOn}）と未割付のバックログを表示しています。`
        : "進行中のスプリントがありません。未割付のバックログだけを表示しています。"}</p>}
      <label>スプリント<select value={sprintId} onChange={e => { setSprintId(e.target.value); setHistory([]); }}><option value="">全体バックログ</option>{data.sprints.map(s => <option key={s.id} value={s.id}>{s.name} ({s.status})</option>)}</select></label>
      {sprint && <section className="card">
        <h2>{sprint.name}</h2><p>{sprint.goal}</p>
        <p>{sprint.startsOn} ～ {sprint.endsOn} ／周期 {sprint.cadenceDays} 日 ／当初締め切り {sprint.originalEndsOn} ／バッファ上限 {sprint.bufferEndsOn}</p>
        <p>未完了の見積 {sprint.impact.estimatedMinutes} 分 ／容量 {sprint.capacityMinutes ?? "未設定"} 分</p>
        <p role="status">{({ unknown: "見積・容量が未設定のため予測できません", within: "見積は締め切り内です", buffer: "バッファを使う見込みです。締め切りを調整してください", reschedule: "バッファ上限を超える見込みです。リスケしてください" })[sprint.impact.state]}
          {sprint.impact.projectedEndsOn && `（容量に基づく目安: ${sprint.impact.projectedEndsOn}）`}</p>
        {sprint.impact.overdueTaskIds.length > 0 && <p>タスク個別の締め切りを再確認: {sprint.impact.overdueTaskIds.length} 件</p>}
        {canEdit && sprint.status !== "closed" && <SprintAdjustment key={sprint.id} team={team} sprint={sprint} onSaved={refresh} />}
        <button className="btn" onClick={() => { void planningApi.history(team, sprint.id).then(r => setHistory(r.changes)).catch(e => setError(e.message)); }}>変更履歴</button>
        {history.map((h, i) => <details key={i}><summary>{h.createdAt} {h.kind}: {h.reason}</summary><p>判断者 {h.actorId}</p><pre>{h.beforeJson}</pre><pre>{h.afterJson}</pre></details>)}
      </section>}
      {canEdit && <form className="planning-form" onSubmit={group}><h2>同系統をまとめる</h2><p>タスク本文・担当・状態を保ったまま、選択した項目をまとめます。</p>
        {data.suggestions.map((suggestion, i) => <p key={i}>{suggestion.ids.map(id => data.tasks.find(t => t.id === id)?.title).join(" ／ ")} — {suggestion.reason}
          <button type="button" className="btn btn-sm" onClick={() => setSelected(suggestion.ids)}>候補を選択</button></p>)}
        <label>まとめる名前<input name="name" required /></label><label>理由<input name="reason" required /></label>
        <button className="btn" disabled={busy || selected.length < 2}>選択した {selected.length} 件をまとめる</button>
      </form>}
      {canEdit && sprint && sprint.status !== "closed" && <label>割付・差し込み・取り外しの理由<input value={reason} onChange={e => setReason(e.target.value)} required /></label>}
      <div className="planning-table"><table><thead><tr><th>選択</th><th>タスク</th><th>まとまり</th><th>状態</th><th>担当・見積</th><th>作業者</th><th>クリティカルパス</th><th>プロジェクト</th><th>スプリント</th><th>操作</th></tr></thead><tbody>
        {visibleTasks.map((task, index) => <tr key={task.id} className={task.sprintId === sprintId ? "planning-assigned" : ""}>
          <td><input type="checkbox" aria-label={`${task.title}を選択`} checked={selected.includes(task.id)} onChange={e => setSelected(prev => e.target.checked ? [...prev, task.id] : prev.filter(id => id !== task.id))} /></td>
          <td><details><summary>{task.title}</summary><pre>{task.description}</pre><pre>{task.requirements}</pre><p>期限: {task.deadline ? new Date(task.deadline * 1000).toLocaleString() : "未設定"}</p></details></td>
          <td>{data.groups.find(g => g.id === task.groupId)?.name ?? "—"}</td><td>{task.status}</td><td>{task.assigneeId} / {task.estimatedMinutes ?? "?"} 分</td>
          <td>{executorText(task)}</td><td>{criticalPathText(task)}</td><td>{projects.find(p => p.code === task.projectId)?.name ?? task.projectId ?? "—"}</td>
          <td>{data.sprints.find(s => s.id === task.sprintId)?.name ?? "未割付"}</td><td>
            {canEdit && view === "all" && index > 0 && <button className="btn btn-sm" disabled={busy} onClick={() => {
              const ids = data.tasks.map(t => t.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
              void run(() => planningApi.mutate(team, "/order", { taskIds: ids }, "PUT"));
            }}>↑</button>}
            {canEdit && sprint && sprint.status !== "closed" && (!task.sprintId || task.sprintId === sprint.id) && <button className="btn btn-sm" disabled={busy || !reason.trim() || (!task.sprintId && ["done", "cancelled"].includes(task.status))} onClick={() => void run(() => planningApi.mutate(team, `/sprints/${sprint.id}`, {
              action: task.sprintId ? "remove" : "assign", taskId: task.id, reason, revision: sprint.revision,
            }, "PATCH"))}>{task.sprintId ? "バックログへ戻す" : sprint.status === "active" ? "差し込む" : "割り付ける"}</button>}
          </td></tr>)}
      </tbody></table></div>
      {visibleTasks.length === 0 && <p>{view === "current" && data.tasks.length > 0 ? "現在のスプリントと未割付のバックログに該当するタスクはありません。" : "バックログは空です。手動追加または Pf 仕様の精査から登録できます。"}</p>}
      {canEdit && data.groups.map(g => <p key={g.id}>{g.name} — {g.reason} <button className="btn btn-sm" disabled={busy} onClick={() => void run(() => planningApi.mutate(team, `/groups/${g.id}`, {}, "DELETE"))}>まとまりを解除</button></p>)}
    </>}
  </div>;
}
