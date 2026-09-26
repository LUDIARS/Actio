import { useEffect, useRef, useState } from "react";
import { terpsichoreApi, type ExecutionPreview, type ExecutionStatus, type ExecutionTemplate } from "../../lib/terpsichore-api";

interface Props { team: string; projectId: string; revision: number; enabled: boolean; canEdit: boolean }
const labels = { submitting: "受付確認中", running: "Ccで作業中", unknown: "受付・継続結果を確認中", completed: "Ccの実行終了", partial: "残件あり", failed: "Ccの実行失敗" };
export function TerpsichoreExecution({ team, projectId, revision, enabled, canEdit }: Props) {
  const [preview, setPreview] = useState<ExecutionPreview | null>(null);
  const [templates, setTemplates] = useState<ExecutionTemplate[]>([]);
  const [callName, setCallName] = useState("");
  const [status, setStatus] = useState<ExecutionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [unresolved, setUnresolved] = useState(false);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const active = unresolved || (status?.execution && ["submitting", "running", "unknown"].includes(status.execution.state));
  const perform = async (action: "preview" | "start" | "status") => {
    setBusy(true); setError("");
    try {
      if (action === "preview") {
        const [next, available, progress] = await Promise.all([terpsichoreApi.executionPreview(team, projectId), terpsichoreApi.templates(team), terpsichoreApi.executionStatus(team, projectId)]);
        if (mounted.current) { setPreview(next); setTemplates(available.templates); setStatus(progress); setUnresolved(false); }
      } else if (action === "start" && preview) {
        // A lost response must be reconciled through status before another start.
        setUnresolved(true);
        const result = await terpsichoreApi.execute(team, projectId, callName, preview);
        if (mounted.current) { setStatus({ execution: result.execution, remoteStatus: null, remainingTaskIds: result.execution.taskIds }); setUnresolved(false); setPreview(null); }
      } else {
        const progress = await terpsichoreApi.executionStatus(team, projectId);
        if (mounted.current) { setStatus(progress); setUnresolved(false); }
      }
    } catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : "委託状況を取得できませんでした"); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <section className="terpsichore-execution"><h3>Ccでバックログを順次実装</h3>
    <p>未着手のAIタスクから、目的・受入条件・担当・見積りと依存関係が揃ったものを、一つの委託で順に進めます。人間のタスクや確認待ちは委託対象から外し、バックログに残します。</p>
    {!projectId && <p>対象プロジェクトを選択してください。</p>}
    {projectId && <>
      {!enabled && canEdit && <p>全体バックログを選び、最新の支援計画を評価・保存すると委託できます。</p>}
      <div className="terpsichore-actions">
        {canEdit && <button className="btn" disabled={busy || !enabled} onClick={() => void perform("preview")}>委託候補を確認</button>}
        <button className="btn" disabled={busy} onClick={() => void perform("status")}>実行状態と残件を確認</button>
      </div>
      {preview && canEdit && <>
        <p>委託候補 {preview.tasks.length} 件。対象は開始時に固定します。</p>
        <ol>{preview.tasks.map(t => <li key={t.id}>{t.title}</li>)}</ol>
        <label>実装を委託するワーカー<select value={callName} disabled={busy} onChange={e => setCallName(e.target.value)}><option value="">選択してください</option>{templates.map(t => <option key={t.callName} value={t.callName}>{t.title} ({t.callName})</option>)}</select></label>
        {!templates.length && <p>利用可能な実装委託テンプレートがありません。</p>}
        <button className="btn" disabled={busy || !enabled || !!active || !callName || preview.tasks.length === 0 || preview.planRevision !== revision} onClick={() => void perform("start")}>この {preview.tasks.length} 件の実装をCcへ委託</button>
      </>}
      {unresolved && <p role="status">受付結果を確認してください。結果が分かるまで再送はしません。</p>}
      {status?.execution && <div role="status"><p>{labels[status.execution.state]}{status.remoteStatus ? ` (${status.remoteStatus})` : ""}</p>
        <p>Actioで未完了: {status.remainingTaskIds.length} / {status.execution.taskIds.length} 件</p>
        {status.remainingTaskIds.length > 0 && <details><summary>残件のタスクID</summary><ul>{status.remainingTaskIds.map(id => <li key={id}>{id}</li>)}</ul></details>}
        <p>Ccの実行終了後も、受入条件・レビュー・Actioの完了記録を確認します。</p>
        {status.execution.runId && <p>実行ID: <code>{status.execution.runId}</code></p>}
      </div>}
      {status && !status.execution && <p>このプロジェクトからの委託はまだありません。</p>}
    </>}
    {error && <p role="alert">{error}</p>}{busy && <p role="status">Ccの委託情報を確認中…</p>}
  </section>;
}
