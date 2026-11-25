// One verdict for the entire page (C-27).
type Row = Record<string, unknown>;

export default {
  post: (result: readonly Row[], tasks: readonly Row[], includeDescription: boolean): true | string => {
    if (result.length !== tasks.length) return "summary count changed";
    for (const [index, task] of tasks.entries()) {
      const row = result[index];
      if (row.id !== task.id || row.pluginPayload !== task.pluginPayload) return "row order or pluginPayload changed";
      if ("requirements" in row || "completionEvidence" in row || "publicSummary" in row) return "body fields must be omitted";
      if (includeDescription ? row.description !== (task.description ?? null) : "description" in row) {
        return "description must be kept only on include";
      }
    }
    return true;
  },
};
