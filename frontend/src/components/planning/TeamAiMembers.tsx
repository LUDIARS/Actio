import { useState, type FormEvent } from "react";
import { planningApi, type TeamMember } from "../../lib/planning-api";

/** チーム設定: Cc の委託テンプレートを AI メンバーとして登録・削除する (リーダー / 管理者)。 */
export function TeamAiMembers({ team, members, onChanged }: {
  team: string; members: TeamMember[]; onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ai = members.filter(member => member.kind === "ai");
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true); setError("");
    try { await action(); await onChanged(); return true; }
    catch (e) { setError((e as Error).message); return false; }
    finally { setBusy(false); }
  };
  const add = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const callName = String(new FormData(form).get("callName") ?? "").trim();
    if (!callName) return;
    void run(() => planningApi.addAiMember(team, callName)).then(saved => { if (saved) form.reset(); });
  };
  return <details><summary>チーム設定: AI メンバー（{ai.length}）</summary>
    <p>Concordia の委託テンプレートを AI メンバーとして登録すると、タスクの担当者（責任者）に選べます。
      スプリントのフェーズ承認や受入承認は AI メンバーには行えません。</p>
    {error && <p role="alert">{error}</p>}
    {ai.length === 0 && <p>AI メンバーは登録されていません。</p>}
    <ul>{ai.map(member => <li key={member.userId}>AI: {member.callName}{" "}
      <button type="button" className="btn btn-sm" disabled={busy}
        onClick={() => { const callName = member.callName; if (callName) void run(() => planningApi.removeAiMember(team, callName)); }}>削除</button>
    </li>)}</ul>
    <form className="planning-form" onSubmit={add}>
      <label>委託テンプレートの呼び出し名<input name="callName" required placeholder="例: fable" pattern="[A-Za-z0-9._\/@\-]{1,120}" /></label>
      <button className="btn" disabled={busy}>AI メンバーを追加</button>
    </form>
  </details>;
}
