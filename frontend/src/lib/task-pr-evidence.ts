export interface TaskPrView {
  key: string;
  label: string;
  url: string | null;
  state: string;
  review: string;
  reflection: string;
  observedAt: string;
}

const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const safeUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) ? url.href : null; }
  catch { return null; }
};

/** Treat plugin payload as external data; never render arbitrary objects or links. */
export function taskPrViews(payload: Record<string, unknown> | null): TaskPrView[] {
  if (!Array.isArray(payload?.pull_requests)) return [];
  return payload.pull_requests.flatMap((value: unknown) => {
    if (!record(value) || !["revisor", "github"].includes(String(value.provider))
      || typeof value.repository !== "string" || !value.repository || typeof value.id !== "string"
      || !Number.isSafeInteger(value.number) || Number(value.number) < 1) return [];
    const stale = !value.head_sha || value.head_sha !== value.reviewed_head_sha;
    const review = typeof value.review === "string" ? value.review : "unknown";
    const reviews: Record<string, string> = { test_ok: "テスト成功", approved: "承認済み", queued: "審査待ち", running: "審査中", failed: "テスト失敗", action_required: "修正待ち", stale: "再レビューが必要" };
    const states: Record<string, string> = { open: "オープン", draft: "下書き", merged: "マージ済み", closed: "クローズ" };
    const reflections: Record<string, string> = { unknown: "反映未確認", pending: "反映待ち", verified: "反映確認済み" };
    const effectiveReview = stale && ["test_ok", "approved", "success"].includes(review) ? "stale" : review;
    return [{ key: JSON.stringify([value.provider, value.repository, value.id]),
      label: `${value.provider === "revisor" ? "Rv" : "GitHub"} ${value.repository} #${value.number}`,
      url: safeUrl(value.url), state: states[String(value.state)] ?? "状態不明",
      review: reviews[effectiveReview] ?? effectiveReview,
      reflection: reflections[String(value.reflection)] ?? "反映未確認",
      observedAt: typeof value.observed_at === "string" && Number.isFinite(Date.parse(value.observed_at)) ? value.observed_at : "取得日時不明" }];
  });
}
