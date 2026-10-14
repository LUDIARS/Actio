// Contract for toPublicTaskIssue (C-15). The public row is a fixed whitelist: body,
// requirements, assignee and creator never reach the unauthenticated surface.
const ALLOWED = ["id", "title", "summary", "status", "priority", "createdAt", "completedAt"];

export default {
  post: (result: Record<string, unknown>, task: Record<string, unknown>): true | string => {
    const keys = Object.keys(result).sort();
    if (JSON.stringify(keys) !== JSON.stringify([...ALLOWED].sort())) return `public issue keys must be ${ALLOWED.join(",")}`;
    if (result.summary !== (task.publicSummary ?? null)) return "summary must come from publicSummary only";
    return true;
  },
};
