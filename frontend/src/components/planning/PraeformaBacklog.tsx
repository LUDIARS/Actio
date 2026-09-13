import { useState, type FormEvent } from "react";
import { planningApi, type PfSpec, type PfDetail } from "../../lib/planning-api";

export function PraeformaBacklog({ team, members, onSaved }: { team: string; members: string[]; onSaved: () => Promise<void> }) {
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [project, setProject] = useState("");
  const [specs, setSpecs] = useState<PfSpec[]>([]);
  const [detail, setDetail] = useState<PfDetail | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setMessage("");
    try { await fn(); } catch (e) { setMessage((e as Error).message); } finally { setBusy(false); }
  };
  const selectProject = (id: string) => {
    setProject(id); setSpecs([]); setDetail(null);
    if (id) void run(async () => setSpecs((await planningApi.specs(team, id)).items));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!detail) return;
    const data = new FormData(event.currentTarget);
    void run(async () => {
      const result = await planningApi.import(team, project, detail.spec.id, {
        fingerprint: detail.fingerprint, assigneeId: data.get("assigneeId"),
        existingFingerprint: detail.existingTask?.fingerprint ?? null,
        deadline: new Date(String(data.get("deadline"))).toISOString(),
        estimatedMinutes: Number(data.get("estimatedMinutes")), reviewNote: data.get("reviewNote"),
      });
      setMessage(result.created ? "バックログへ登録しました。割付後にスプリントへの影響を確認できます。" : detail.existingTask ? "精査結果を既存タスクへ反映しました。スプリントへの影響を確認してください。" : "この仕様は登録済みです。再取得して既存タスクを精査してください。");
      setDetail(await planningApi.spec(team, project, detail.spec.id));
      await onSaved();
    });
  };
  return <details><summary>Pf の仕様を精査してバックログへ登録</summary>
    <button className="btn" disabled={busy} onClick={() => void run(async () => setProjects((await planningApi.projects(team)).items))}>Pf プロジェクトを取得</button>
    <label>プロジェクト<select value={project} disabled={busy} onChange={e => selectProject(e.target.value)}><option value="">選択</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
    {project && <label>仕様<select disabled={busy} value={detail?.spec.id ?? ""} onChange={e => {
      const id = e.target.value; setDetail(null);
      if (id) void run(async () => setDetail(await planningApi.spec(team, project, id)));
    }}><option value="">選択</option>{specs.map(s => <option key={s.id} value={s.id}>{s.code} {s.title} ({s.status})</option>)}</select></label>}
    {detail && <form onSubmit={submit} className="planning-form" key={detail.fingerprint}>
      <h3>{detail.spec.code}: {detail.spec.title}</h3><p>仕様版 {detail.spec.version} / {detail.spec.status}</p>
      <pre>{detail.spec.description}</pre><ul>{detail.acceptance.filter(a => a.enabled).map((a, i) => <li key={i}>{a.text}</li>)}</ul>
      <p>前提条件: {detail.spec.preconditions?.join(" / ") || "なし"}</p><p>事後条件: {detail.spec.postconditions?.join(" / ") || "なし"}</p>
      {detail.existingTask && <details open><summary>登録済みタスクの要件（今回の精査結果で更新）</summary><pre>{detail.existingTask.requirements}</pre><p>現在の見積: {detail.existingTask.estimatedMinutes ?? "未設定"} 分</p></details>}
      <label>精査結果・残る作業<textarea name="reviewNote" required placeholder="実装との差分、今回取り組む内容、確認事項" /></label>
      <label>担当者<select name="assigneeId" required><option value="">選択</option>{members.map(m => <option key={m}>{m}</option>)}</select></label>
      <label>タスク締め切り<input name="deadline" type="datetime-local" required /></label>
      <label>見積工数（分）<input name="estimatedMinutes" type="number" min="1" required /></label>
      <button className="btn btn-primary" disabled={busy || detail.spec.status === "obsolete"}>{detail.existingTask ? "再精査して更新" : "精査して登録"}</button>
    </form>}
    {message && <p role="status">{message}</p>}
  </details>;
}
