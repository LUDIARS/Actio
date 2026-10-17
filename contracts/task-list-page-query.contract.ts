// Contract for parseTaskListPageQuery (C-18). limit defaults to 100 and only 1..500
// integers pass; malformed status, dates, include and cursor values are rejected.
type Query = Record<string, string | undefined>;
type Result = { ok: true; value: { limit: number; statuses: string[] } } | { ok: false; error: string };

const STATUSES = ["open", "in_progress", "blocked", "done", "cancelled", "todo", "doing"];

function mustReject(query: Query): string | null {
  const limit = query.limit;
  if (limit !== undefined && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 500)) return "limit out of range";
  if (query.status && query.status.split(",").some((s) => !STATUSES.includes(s.trim()))) return "unknown status";
  if (query.include && query.include.split(",").some((s) => s.trim() !== "description")) return "unknown include";
  for (const name of ["updated_since", "due_after"]) {
    const raw = query[name];
    if (raw && Number.isNaN(new Date(raw).getTime())) return `invalid ${name}`;
  }
  return null;
}

export default {
  post: (result: Result, query: Query): true | string => {
    const reason = mustReject(query);
    if (reason) return result.ok === false || `${reason} must be rejected`;
    if (!result.ok) return true;
    const { limit } = result.value;
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) return "limit must stay within 1..500";
    if (query.limit === undefined && limit !== 100) return "default limit must be 100";
    return true;
  },
};
