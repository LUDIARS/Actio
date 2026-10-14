// Contract for normalizeKind (C-12). issue / goal are kept; anything else is a plain task.
export default {
  post: (result: string, input: unknown): true | string => {
    const expected = input === "issue" || input === "goal" ? input : "task";
    return result === expected || `kind ${String(input)} must normalize to ${expected}`;
  },
};
