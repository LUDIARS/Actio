import { useState, type FormEvent } from "react";
import { request } from "../../lib/api";
import { chatBase } from "../../lib/chat-api";
export function ChatRetryForm({ team, id, state, saved }: { team: string; id: string; state: string; saved: () => void }) {
  const [reason, setReason] = useState(""), [checked, setChecked] = useState(false), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try { await request(`${chatBase(team)}/outbox/${id}/retry`, { method: "POST", body: JSON.stringify({ expectedState: state, checkedExternalState: checked, reason }) }); saved(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  if (state !== "unknown" && state !== "failed") return null;
  return <details><summary>外部状態を確認して再送を許可</summary><form onSubmit={e => void submit(e)}><p>結果不明の操作には二重投稿の可能性があります。Discord／Slackの投稿・チャンネルを確認してください。議論の発言案は再送できません。</p><label><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} required />外部の状態を確認し、再送が必要と判断しました</label><label>確認内容・理由<textarea required value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy || !checked}>再送を許可</button>{error && <p role="alert">{error}</p>}</form></details>;
}
