// @spec スプリントフェーズのAPIと画面契約
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiRequestError } from "../../lib/api";
import { sprintPhaseApi, type SprintHumanDecision, type SprintPhaseView } from "../../lib/sprint-phase-api";

// Keep an uncertain request across sprint navigation, scoped to the signed-in user.
// Nothing is replayed automatically; a retry always sends the original event and payload.
const pendingDecisions = new Map<string, SprintHumanDecision>();
const message = (error: unknown): string => error instanceof Error ? error.message : "処理に失敗しました";

export function useSprintPhase(ownerId: string, team: string, sprintId: string, onChanged: () => Promise<void>) {
  const requestKey = `${ownerId}:${team}:${sprintId}`;
  const [view, setView] = useState<SprintPhaseView | null>(null);
  const [retrospective, setRetrospective] = useState("");
  const [nextSprintId, setNextSprintId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(true);
  const [pending, setPending] = useState<SprintHumanDecision | null>(() => pendingDecisions.get(requestKey) ?? null);
  const live = useRef(false);
  const epoch = useRef(0);
  const operation = useRef(false);
  const viewRef = useRef<SprintPhaseView | null>(null);
  const draft = useRef({ retrospective: "", nextSprintId: "" });

  const applyView = useCallback((result: SprintPhaseView, replaceDraft = false): void => {
    const previous = viewRef.current;
    const untouched = !previous || (draft.current.retrospective === previous.retrospective
      && draft.current.nextSprintId === (previous.nextSprintId ?? ""));
    viewRef.current = result; setView(result);
    if (replaceDraft || untouched) {
      draft.current = { retrospective: result.retrospective, nextSprintId: result.nextSprintId ?? "" };
      setRetrospective(draft.current.retrospective); setNextSprintId(draft.current.nextSprintId);
    }
    const waiting = pendingDecisions.get(requestKey);
    if (waiting && result.history.some(item => item.eventId === `ui:${waiting.eventId}` || item.eventId === waiting.eventId)) {
      pendingDecisions.delete(requestKey); setPending(null);
      setNotice("送信した判断の記録を確認しました。現在のフェーズと履歴を確認してください。");
    }
  }, [requestKey]);

  useEffect(() => {
    const controller = new AbortController();
    live.current = true; epoch.current += 1; operation.current = true;
    void sprintPhaseApi.load(team, sprintId, controller.signal).then(result => {
      if (!controller.signal.aborted) applyView(result);
    }).catch(cause => { if (!controller.signal.aborted) setError(message(cause)); })
      .finally(() => { if (!controller.signal.aborted) { operation.current = false; setBusy(false); } });
    return () => { live.current = false; epoch.current += 1; controller.abort(); };
  }, [team, sprintId, applyView]);

  const editRetrospective = (value: string): void => {
    draft.current = { ...draft.current, retrospective: value }; setRetrospective(value); setNotice("");
  };
  const editNextSprint = (value: string): void => {
    draft.current = { ...draft.current, nextSprintId: value }; setNextSprintId(value); setNotice("");
  };
  const refresh = async (): Promise<void> => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError("");
    const started = epoch.current;
    try {
      const result = await sprintPhaseApi.load(team, sprintId);
      if (live.current && epoch.current === started) { applyView(result); setNotice("最新の状態を読み込みました。編集中の内容は保持しています。"); }
    } catch (cause) { if (live.current && epoch.current === started) setError(message(cause)); }
    finally { if (live.current && epoch.current === started) { operation.current = false; setBusy(false); } }
  };
  const dirty = !!view && (retrospective !== view.retrospective || nextSprintId !== (view.nextSprintId ?? ""));
  const saveContext = async (reason: string): Promise<void> => {
    if (operation.current || pendingDecisions.has(requestKey) || !view || !view.allowedToDecide || !reason.trim()) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    const started = epoch.current;
    const input = { expectedRevision: view.state.revision, sourceFingerprint: view.state.sourceFingerprint,
      retrospective, nextSprintId: nextSprintId || null, reason: reason.trim() };
    try {
      const result = await sprintPhaseApi.context(team, sprintId, input);
      if (live.current && epoch.current === started) { applyView(result, true); setNotice("確認内容を保存しました。フェーズを進めるには、別途承認してください。"); }
    } catch (cause) {
      if (live.current && epoch.current === started) setError(`${message(cause)}。内容は保持しています。最新状態を確認してから操作してください。`);
    } finally { if (live.current && epoch.current === started) { operation.current = false; setBusy(false); } }
  };
  const sendDecision = async (input: SprintHumanDecision): Promise<void> => {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    pendingDecisions.set(requestKey, input); setPending(input);
    const started = epoch.current;
    try {
      const result = await sprintPhaseApi.decide(team, sprintId, input);
      if (pendingDecisions.get(requestKey)?.eventId === input.eventId) pendingDecisions.delete(requestKey);
      if (live.current && epoch.current === started) {
        setPending(null); applyView(result); setNotice("判断を記録しました。現在のフェーズと履歴を確認してください。");
        try { await onChanged(); } catch (cause) { if (live.current && epoch.current === started) setError(`判断は記録済みです。一覧の更新に失敗しました: ${message(cause)}`); }
      }
    } catch (cause) {
      const rejected = cause instanceof ApiRequestError && cause.status >= 400 && cause.status < 500;
      if (rejected && pendingDecisions.get(requestKey)?.eventId === input.eventId) pendingDecisions.delete(requestKey);
      if (live.current && epoch.current === started) {
        if (rejected) setPending(null);
        setError(rejected ? `${message(cause)}。最新状態を確認してから判断し直してください。`
          : `${message(cause)}。判断が届いたか確認できません。最新状態の確認、または同じ判断の再送を選んでください。`);
      }
    } finally { if (live.current && epoch.current === started) { operation.current = false; setBusy(false); } }
  };
  const decide = async (action: SprintHumanDecision["action"], reason: string, taskIds?: string[]): Promise<void> => {
    if (!view || !view.allowedToDecide || dirty || pendingDecisions.has(requestKey) || !reason.trim()) return;
    await sendDecision({ action, reason: reason.trim(), taskIds, eventId: crypto.randomUUID(),
      expectedRevision: view.state.revision, sourceFingerprint: view.state.sourceFingerprint });
  };
  const retry = async (): Promise<void> => { if (pending) await sendDecision(pending); };
  const discardDraft = (): void => { if (view && !operation.current) applyView(view, true); };
  return { view, retrospective, nextSprintId, editRetrospective, editNextSprint, dirty, busy, error, notice, pending,
    refresh, saveContext, decide, retry, discardDraft };
}
