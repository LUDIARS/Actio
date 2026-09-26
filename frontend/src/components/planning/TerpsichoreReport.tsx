import type { GuidanceReport, JudgmentCard } from "../../lib/terpsichore-api";

const labels: Record<string, string> = { undefined: "未定義", pending: "未達成", achieved: "達成", needs_definition: "定義不足", blocked: "待ちあり", in_progress: "進行中", verify: "体験を確認", ready: "着手候補", refine: "定義を補う", done: "タスク完了", cancelled: "取消", unknown: "判断材料不足", on_track: "容量内", at_risk: "要調整", complete: "タスク完了", closed: "終了" };
export function TerpsichoreReport({ report, cards }: { report: GuidanceReport; cards: JudgmentCard[] }) {
  return <div className="terpsichore-report" aria-live="polite">
    <p>暫定完成: <strong>{labels[report.provisionalState]}</strong> ／ UXゴール: <strong>{labels[report.uxState]}</strong></p>
    {report.goalGaps.length > 0 && <p>ゴールの不足: {report.goalGaps.join("・")}</p>}
    <h3>次にすること</h3><ol>{report.nextActions.map(action => <li key={action}>{action}</li>)}</ol>
    <h3>到達点</h3><ol>{report.checkpoints.map(c => <li key={c.id}><strong>{c.title}: {labels[c.state]}</strong><p>{c.nextAction}</p>{c.missing.map(m => <p key={m}>{m}</p>)}</li>)}</ol>
    <h3>スプリントの進行</h3>{report.sprints.length === 0 && <p>対象スプリントがありません。</p>}
    {report.sprints.map(s => <section key={s.id}><h4>{s.name}: {labels[s.state]}</h4><p>完了 {s.completed} / 残 {s.pending} / 取消 {s.cancelled}。見積残作業 {s.remainingMinutes} 分（見積不明 {s.unknownEstimates} 件）、残容量 {s.remainingCapacityMinutes ?? "不明"} 分。</p>
      <ul>{s.findings.map((f,i) => <li key={i}>{f.taskId ? `${report.backlog.find(t => t.taskId === f.taskId)?.title ?? f.taskId}: ` : ""}{f.reason} → {f.nextAction}</li>)}</ul></section>)}
    <h3>着手候補の順序</h3><ol>{report.candidateTaskIds.map(id => <li key={id}>{report.backlog.find(t => t.taskId === id)?.title ?? id}</li>)}</ol>
    <details><summary>バックログの定義と阻害事項</summary>{report.backlog.map(t => <section key={t.taskId}><h4>{t.title}: {labels[t.state]}</h4>
      {t.gaps.length > 0 && <p>不足: {t.gaps.join("・")}</p>}{t.blockers.map((b,i) => <p key={i}>{b.reason} → {b.nextAction}</p>)}
      {t.splitSuggested && <p>受入条件が多いため、利用者が確認できる小さな単位への分割を検討してください。</p>}
      <details><summary>要件の原案</summary><pre>{t.definitionDraft}</pre></details></section>)}</details>
    <h3>今回残す課題</h3><ul>{report.deferred.map((d,i) => <li key={i}>{d}</li>)}</ul>
    {report.retroLessons.length > 0 && <><h3>次回への改善案</h3><ul>{report.retroLessons.map(r => <li key={r}>{r}</li>)}</ul></>}
    {cards.length > 0 && <><h3>過去の判断からの参考</h3><p>今回への適用は根拠と照合してください。</p>{cards.map(card => <blockquote key={card.id}><p>{card.judgment}</p><p>{card.rationale}</p><small>Genius {card.id} ／ 出典: {card.sourceRef} ／ 確信度 {Math.round(card.confidence * 100)}%</small></blockquote>)}</>}
    <small>評価日時: {new Date(report.generatedAt).toLocaleString()}。容量は一定の処理量を仮定した目安です。</small>
  </div>;
}
