// @spec スプリントフェーズのAPIと画面契約
import { useEffect, useState } from "react";
import type { Sprint, TeamProject } from "../../lib/planning-api";
import { sprintPhaseApi, type SprintPhasePlan } from "../../lib/sprint-phase-api";
import { SprintPhaseEvidence } from "./SprintPhaseEvidence";

type NextPlan = SprintPhasePlan;
export function SprintNextPlan({ team, currentId, selectedId, savedPlan, sprints, projects, disabled, onChange }: {
  team: string; currentId: string; selectedId: string; savedPlan: NextPlan | null;
  sprints: Sprint[]; projects: TeamProject[]; disabled: boolean; onChange(value: string): void;
}) {
  const [loaded, setLoaded] = useState<{ id: string; plan: NextPlan | null; error: string } | null>(null);
  const saved = savedPlan?.sprint.id === selectedId ? savedPlan : null;
  useEffect(() => {
    if (!selectedId || saved) return;
    const controller = new AbortController();
    void sprintPhaseApi.load(team, selectedId, controller.signal).then(value => {
      if (!controller.signal.aborted) setLoaded({ id: selectedId, plan: { sprint: value.sprint, tasks: value.tasks, complete: value.complete }, error: "" });
    }).catch(cause => {
      if (!controller.signal.aborted) setLoaded({ id: selectedId, plan: null, error: cause instanceof Error ? cause.message : "次計画を取得できません" });
    });
    return () => controller.abort();
  }, [team, selectedId, saved]);
  const result = loaded?.id === selectedId ? loaded : null;
  const preview = saved ?? result?.plan;
  const candidates = sprints.filter(sprint => sprint.id !== currentId && sprint.status === "planning");
  return <section>
    <label>次に開始する計画<select value={selectedId} disabled={disabled} onChange={event => onChange(event.target.value)}>
      <option value="">まだ選ばない</option>
      {selectedId && !candidates.some(sprint => sprint.id === selectedId) && <option value={selectedId}>保存済みの計画（候補一覧から再確認してください）</option>}
      {candidates.map(sprint => <option value={sprint.id} key={sprint.id}>{sprint.name}（{sprint.startsOn} ～ {sprint.endsOn}）</option>)}
    </select></label>
    <p>次計画は「スプリントを計画」で作成し、バックログを割り付けてから選択してください。</p>
    {selectedId && !saved && <p>選択変更は未保存です。保存後に表示される目標・期間・容量・対象を確認して承認してください。</p>}
    {selectedId && !preview && !result?.error && <p role="status">次計画の対象を読み込んでいます…</p>}
    {result?.error && !saved && <p role="alert">{result.error}</p>}
    {preview && <SprintPhaseEvidence {...preview} projects={projects} />}
  </section>;
}
