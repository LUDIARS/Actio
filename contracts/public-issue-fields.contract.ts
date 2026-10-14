// Contract for readPublicIssueFields (C-17). public_hidden is boolean-only and
// public_summary is a bounded string or null; other shapes are rejected.
type Result = { ok: true; value: { publicHidden?: boolean; publicSummary?: string | null } } | { ok: false; error: string };

export default {
  post: (result: Result, body: Record<string, unknown>): true | string => {
    const hidden = body.publicHidden !== undefined ? body.publicHidden : body.public_hidden;
    const summary = body.publicSummary !== undefined ? body.publicSummary : body.public_summary;
    const hiddenOk = hidden === undefined || typeof hidden === "boolean";
    const summaryOk = summary === undefined || summary === null || (typeof summary === "string" && summary.trim().length <= 1000);
    if (result.ok !== (hiddenOk && summaryOk)) return "public field validation must accept only boolean / bounded string";
    return true;
  },
};
