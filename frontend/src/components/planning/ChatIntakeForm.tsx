import { useState, type FormEvent } from "react";
import { request } from "../../lib/api";
import { chatBase, type ChatIntake } from "../../lib/chat-api";

export function ChatIntakeForm({ team, intake, saved }: { team: string; intake: ChatIntake; saved: () => void }) {
  const [form, setForm] = useState({ title: intake.review?.title ?? "", purpose: intake.review?.purpose ?? "", change: intake.review?.change ?? "", acceptance: intake.review?.acceptance.join("\n") ?? "", reviewNote: "" });
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      await request(`${chatBase(team)}/intakes/${intake.id}/confirm`, { method: "POST", body: JSON.stringify({ ...form, revision: intake.revision, acceptance: form.acceptance.split("\n").map(s => s.trim()).filter(Boolean) }) }); saved();
    } catch (e) { setError(e instanceof Error ? e.message : "登録できませんでした"); }
    finally { setBusy(false); }
  }
  return <form onSubmit={e => void submit(e)}>
    {([['title', 'タイトル'], ['purpose', '目的'], ['change', '変更内容・範囲'], ['acceptance', '完了条件（1行に1項目）'], ['reviewNote', '不足事項・懸念を確認した判断理由']] as const).map(([key, label]) => <label key={key}>{label}<textarea required value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></label>)}
    <button disabled={busy || intake.sourceDeleted}>内容を確認してバックログ登録</button>{error && <p role="alert">{error}</p>}
  </form>;
}
