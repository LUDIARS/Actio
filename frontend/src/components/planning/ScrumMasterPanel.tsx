// @spec スクラムマスターの役割と権限
import { useEffect, useState, type FormEvent } from "react";
import { scrumMasterApi, type ScrumMasterView } from "../../lib/scrum-master-api";

const message = (error: unknown): string => error instanceof Error ? error.message : "スクラムマスターの処理に失敗しました";

export function ScrumMasterPanel({ team, onChanged }: { team: string; onChanged(): Promise<void> }) {
  const [view, setView] = useState<ScrumMasterView | null>(null);
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void scrumMasterApi.read(team, controller.signal).then(setView)
      .catch(cause => { if (!controller.signal.aborted) setError(message(cause)); });
    return () => controller.abort();
  }, [team]);

  const update = async (work: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      await work();
      setView(await scrumMasterApi.read(team));
      await onChanged();
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const assign = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void update(() => scrumMasterApi.assign(team, clientId.trim() || null));
  };
  if (!error && !(view && (view.assignment || view.canManage))) return null;
  const assignment = view?.assignment;
  return <section className="sprint-phase-delivery" aria-label="スクラムマスター">
    <h3>スクラムマスター</h3>
    {error && <p role="alert">{error}</p>}
    <p role="status">{assignment
      ? `Terpsichore が担当中（${assignment.delegate === "api-client" ? "指定した API クライアント" : "この PC の AI セッション"}）。各フェーズの判断を AI が実行できます。`
      : "未割当です。各フェーズは人が判断します。"}</p>
    {assignment && <p>保留すると、解除するまで AI は操作できません。人の結果が必要なタスクは人が完了にします。</p>}
    {view?.canManage && (assignment
      ? <button type="button" className="btn" disabled={busy} onClick={() => void update(() => scrumMasterApi.remove(team))}>スクラムマスターの割当を外す</button>
      : <form className="planning-form" onSubmit={assign}>
        <label>API クライアント ID（空欄ならこの PC の AI セッション）<input maxLength={200} value={clientId} disabled={busy} onChange={e => setClientId(e.target.value)} /></label>
        <button className="btn" disabled={busy}>Terpsichore をスクラムマスターにする</button>
      </form>)}
  </section>;
}
