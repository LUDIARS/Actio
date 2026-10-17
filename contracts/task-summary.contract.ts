// Contract for toTaskSummary (C-20). Body fields never reach the list, description only
// on explicit opt-in, and every other field (pluginPayload included) passes unchanged.
const BODY = ["description", "requirements", "completionEvidence", "publicSummary"];

export default {
  post: (result: Record<string, unknown>, task: Record<string, unknown>, includeDescription: boolean): true | string => {
    for (const field of BODY) {
      if (field === "description" && includeDescription) continue;
      if (field in result) return `${field} must not be in the summary`;
    }
    if (includeDescription && result.description !== (task.description ?? null)) return "description must be kept on include";
    for (const [field, value] of Object.entries(task)) {
      if (BODY.includes(field)) continue;
      if (result[field] !== value) return `${field} must pass through unchanged`;
    }
    return true;
  },
};
