import { useState, type FormEvent } from "react";
import { planningApi, type Sprint } from "../../lib/planning-api";

export function SprintForm({ team, onSaved }: { team: string; onSaved: () => Promise<void> }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true); setError("");
    try {
      await planningApi.mutate(team, "/sprints", {
        name: data.get("name"), goal: data.get("goal"), cadenceDays: Number(data.get("cadenceDays")),
        startsOn: data.get("startsOn"), endsOn: data.get("endsOn"), bufferEndsOn: data.get("bufferEndsOn"),
        capacityMinutes: data.get("capacityMinutes") ? Number(data.get("capacityMinutes")) : null,
      });
      form.reset(); await onSaved();
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <details><summary>スプリントを計画</summary><form onSubmit={submit} className="planning-form">
    <label>名前<input name="name" required maxLength={200} /></label>
    <label>目標<textarea name="goal" /></label>
    <label>周期（日）<input name="cadenceDays" type="number" min="1" max="366" required /></label>
    <label>開始日<input name="startsOn" type="date" required /></label>
    <label>締め切り<input name="endsOn" type="date" required /></label>
    <label>バッファ上限<input name="bufferEndsOn" type="date" required /></label>
    <label>1周期の容量（分・任意）<input name="capacityMinutes" type="number" min="1" /></label>
    <p>周期・締め切り・バッファを先に決めます。容量を入れると見積工数との比較ができます。</p>
    {error && <p role="alert">{error}</p>}<button disabled={busy} className="btn btn-primary">計画を保存</button>
  </form></details>;
}

export function SprintAdjustment({ team, sprint, onSaved }: { team: string; sprint: Sprint; onSaved: () => Promise<void> }) {
  const [action, setAction] = useState("extend");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    const body: Record<string, unknown> = { action, revision: sprint.revision, reason: data.get("reason") };
    if (action === "extend" || action === "reschedule") body.endsOn = data.get("endsOn");
    if (action === "reschedule") {
      body.startsOn = data.get("startsOn"); body.bufferEndsOn = data.get("bufferEndsOn");
      body.cadenceDays = Number(data.get("cadenceDays"));
      body.capacityMinutes = data.get("capacityMinutes") ? Number(data.get("capacityMinutes")) : null;
    }
    setBusy(true); setError("");
    try { await planningApi.mutate(team, `/sprints/${sprint.id}`, body, "PATCH"); await onSaved(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="planning-form" key={`${sprint.id}-${sprint.revision}`}>
    <label>操作<select value={action} onChange={e => setAction(e.target.value)}>
      <option value="extend">バッファ内で延長</option><option value="reschedule">リスケ</option>
      {sprint.status === "planning" && <option value="start">開始</option>}<option value="close">終了して未完了をバックログへ戻す</option>
    </select></label>
    {action === "reschedule" && <label>開始日<input name="startsOn" type="date" defaultValue={sprint.startsOn} readOnly={sprint.status === "active"} required /></label>}
    {(action === "extend" || action === "reschedule") && <label>新しい締め切り<input name="endsOn" type="date" defaultValue={sprint.endsOn} required /></label>}
    {action === "reschedule" && <label>新しいバッファ上限<input name="bufferEndsOn" type="date" defaultValue={sprint.bufferEndsOn} required /></label>}
    {action === "reschedule" && <><label>周期（日）<input name="cadenceDays" type="number" min="1" max="366" defaultValue={sprint.cadenceDays} required /></label>
      <label>1周期の容量（分・任意）<input name="capacityMinutes" type="number" min="1" defaultValue={sprint.capacityMinutes ?? ""} /></label></>}
    <label>判断・変更理由<textarea name="reason" required /></label>
    {error && <p role="alert">{error}</p>}<button className="btn" disabled={busy}>確定</button>
  </form>;
}
