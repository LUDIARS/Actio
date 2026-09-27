import { useState, type FormEvent } from "react";
import { implementationApi, implementationLabels, type ImplementationReview } from "../../lib/implementation-api";
import { tasksApi } from "../../lib/api";

export function PraeformaImplementation({ team, project, members, onSaved }: {
  team: string; project: string; members: string[]; onSaved: () => Promise<void>;
}) {
  const [items, setItems] = useState<ImplementationReview[]>([]);
  const [tasks, setTasks] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [selected, setSelected] = useState("");
  const [action, setAction] = useState("backlog");
  const [busy, setBusy] = useState(false);
  const [canConfirm, setCanConfirm] = useState(false);
  const [message, setMessage] = useState("");
  const current = items.find(item => `${item.kind}/${item.id}` === selected);
  const load = async () => {
    const [reviews, planning] = await Promise.all([implementationApi.load(team, project), tasksApi.list({ teamId: team, kind: "task" })]);
    setItems(reviews.items); setTasks(planning.tasks); setCanConfirm(reviews.canConfirm);
  };
  const run = async (work: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await work(); } catch (error) { setMessage((error as Error).message); } finally { setBusy(false); }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!current) return;
    const fields = new FormData(event.currentTarget);
    const input: Record<string, unknown> = { action, note: fields.get("note") };
    if (action === "link") input.taskId = fields.get("taskId");
    if (action === "backlog") Object.assign(input, { title: fields.get("title"), assigneeId: fields.get("assigneeId"),
      deadline: new Date(String(fields.get("deadline"))).toISOString(), estimatedMinutes: Number(fields.get("estimatedMinutes")) });
    void run(async () => {
      const { item } = await implementationApi.change(team, project, current, input);
      setItems(previous => previous.map(row => row.kind === item.kind && row.id === item.id ? item : row));
      await onSaved(); await load(); setMessage(action === "confirm" ? "人間の確認を記録しました。" : "対象タスクを更新しました。完了後に人間確認へ進みます。");
    });
  };
  return <details><summary>仕様・シナリオの実装状況と人間確認</summary>
    <p>タスク完了 → 人間確認 → 完了。追加バックログで差し戻し、仕様変更で再確認になります。</p>
    <button className="btn" disabled={busy} onClick={() => void run(load)}>実装状況を更新</button>
    <label>確認対象<select value={selected} disabled={busy} onChange={e => setSelected(e.target.value)}>
      <option value="">選択</option>{items.map(item => <option key={`${item.kind}/${item.id}`} value={`${item.kind}/${item.id}`}>
        {item.kind === "scenario" ? "シナリオ" : "仕様"}: {item.title} — {implementationLabels[item.state]}</option>)}
    </select></label>
    {current && <form className="planning-form" onSubmit={submit} key={`${selected}/${current.fingerprint}`}>
      <h3>{current.title}</h3><p>{implementationLabels[current.state]}</p>
      <ul>{current.tasks.map(task => <li key={task.id}>{task.title} — {task.status}（{task.id}）</li>)}</ul>
      {current.confirmation && <p>人間確認: {current.confirmation.confirmedAt} / {current.confirmation.actorId}<br />{current.confirmation.note}</p>}
      <label>操作<select value={action} disabled={busy} onChange={e => setAction(e.target.value)}>
        <option value="backlog">追加作業をバックログへ登録</option><option value="link">既存タスクを現行仕様に関連付ける</option>
        <option value="confirm" disabled={!canConfirm || current.state !== "awaiting_confirmation"}>人間が確認して完了にする</option>
      </select></label>
      {action === "link" && <label>既存タスク<select name="taskId" required><option value="">選択</option>{tasks.map(task => <option key={task.id} value={task.id}>{task.title} ({task.status})</option>)}</select></label>}
      {action === "backlog" && <>
        <label>追加作業<input name="title" required maxLength={200} /></label>
        <label>担当者<select name="assigneeId" required><option value="">選択</option>{members.map(member => <option key={member}>{member}</option>)}</select></label>
        <label>締め切り<input name="deadline" type="datetime-local" required /></label>
        <label>見積工数（分）<input name="estimatedMinutes" type="number" min="1" required /></label>
      </>}
      <label>{action === "confirm" ? "人間が確認した内容" : "作業内容・現行仕様との差分"}<textarea name="note" required maxLength={5000} /></label>
      {!canConfirm && <p>完了の確認には、Actio にチームリーダーとしてログインしてください。</p>}
      <button className="btn btn-primary" disabled={busy || (action === "confirm" && (!canConfirm || current.state !== "awaiting_confirmation"))}>{action === "confirm" ? "確認済みとして完了" : action === "backlog" ? "バックログを追加" : "現行仕様に関連付け"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </details>;
}
