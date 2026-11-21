// @spec 自律スプリントの参加と進行
import { useEffect, useState, type FormEvent } from "react";
import { autonomousSprintApi } from "../../lib/autonomous-sprint-api";

type Action = "pause" | "reconcile" | "release";
const labels: Record<Action, string> = { pause: "一時停止", reconcile: "着手許可の照合を記録", release: "手動運用に戻す" };
const warnings: Record<string, string> = {
  breaker_unavailable: "Concordia の許可を確認できないため、新規着手と次周回を保留しています。",
  breaker_open: "Concordia が新規着手と次周回を遮断しています。",
  phase_blocked: "スプリントの対象や次計画を確認してください。",
  task_stalled: "着手を許可したタスクの更新が停滞しています。",
  scope_changed: "着手を許可したタスクの取消または移動を検出しました。",
  client_disabled: "dots の API クライアントが無効になりました。",
};
const message = (error: unknown): string => error instanceof Error ? error.message : "自律スプリントの処理に失敗しました";

export function AutonomousSprintPanel({ team, sprintId, planning, onChanged }: {
  team: string; sprintId: string; planning: boolean; onChanged(): Promise<void>;
}) {
  const [view, setView] = useState<Awaited<ReturnType<typeof autonomousSprintApi.read>> | null>(null);
  const [clientId, setClientId] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    void autonomousSprintApi.read(team, controller.signal).then(setView)
      .catch(cause => { if (!controller.signal.aborted) setError(message(cause)); });
    return () => controller.abort();
  }, [team]);

  const update = async (work?: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      if (work) await work();
      setView(await autonomousSprintApi.read(team));
      await onChanged();
      if (work) setReason("");
    } catch (cause) {
      setError(message(cause));
    } finally {
      setBusy(false);
    }
  };
  const run = view?.run?.sprintId === sprintId ? view.run : null;
  const enroll = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    void update(() => autonomousSprintApi.enroll(team, sprintId, clientId.trim()));
  };
  const manage = (action: Action): void => {
    if (run) void update(() => autonomousSprintApi.manage(team, sprintId, action, run.revision, reason.trim()));
  };
  if (!run && !error && !(view?.canManage && !view.run && planning)) return null;
  return <section className="sprint-phase-delivery" aria-label="自律スプリント">
    <h3>自律スプリント</h3>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="btn" disabled={busy} onClick={() => void update()}>自律スプリントの状態を確認</button>
    {run ? <>
      <p role="status">{run.status === "paused" ? "一時停止中" : "dots 管制で進行中"} ／ 第 {run.cycle} 周 ／ 完了 {run.progress.done} / {run.progress.total} 件</p>
      <p>停滞 {run.progress.stalledTaskIds.length} 件、ブロック {run.progress.blocked} 件、取消 {run.progress.cancelled} 件</p>
      {run.warning && <p role="alert">{warnings[run.warning] ?? run.warning}</p>}
      {view?.canManage && <div className="planning-form">
        <label>操作の理由<textarea maxLength={2000} value={reason} disabled={busy} onChange={e => setReason(e.target.value)} /></label>
        {run.status === "paused" && run.claimId && <p>作業者が着手許可を処理済みで、実行中の作業がないことを確認してから照合を記録してください。</p>}
        <button type="button" className="btn" disabled={busy || !reason.trim()} onClick={() => manage(run.status === "running" ? "pause" : run.claimId ? "reconcile" : "release")}>
          {labels[run.status === "running" ? "pause" : run.claimId ? "reconcile" : "release"]}
        </button>
      </div>}
    </> : view?.canManage && !view.run && planning && <form className="planning-form" onSubmit={enroll}>
      <label>dots の API クライアント ID<input required maxLength={200} value={clientId} disabled={busy} onChange={e => setClientId(e.target.value)} /></label>
      <button className="btn" disabled={busy || !clientId.trim()}>自律モードを有効にする</button>
    </form>}
  </section>;
}
