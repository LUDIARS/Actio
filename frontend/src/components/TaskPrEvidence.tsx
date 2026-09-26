import { taskPrViews } from "../lib/task-pr-evidence";

export function TaskPrEvidence({ payload }: { payload: Record<string, unknown> | null }) {
  const items = taskPrViews(payload);
  if (!items.length) return null;
  return <div aria-label="関連PR" style={{ display: "grid", gap: "0.35rem", fontSize: "0.8rem" }}>
    {items.map((item) => <div key={item.key}>
      {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.label}</a> : <span>{item.label}</span>}
      <span> — {item.state} · {item.review} · {item.reflection}</span>
      <span style={{ color: "var(--text-muted)" }}>（取得: {item.observedAt}）</span>
    </div>)}
  </div>;
}
