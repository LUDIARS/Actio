// Contract for shouldSyncSchema (C-1). The decision table is the whole
// behaviour, so the predicate re-derives it independently from the input.

type Input = {
  readonly localMode: boolean;
  readonly cernereUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
};

type Decision =
  | { readonly sync: true }
  | { readonly sync: false; readonly reason: string; readonly level: string };

export default {
  post: (result: Decision, input: Input): true | string => {
    if (input.localMode) {
      return (!result.sync && result.reason === "local-mode" && result.level === "info")
        || "local mode must skip with an info log";
    }
    if (!input.cernereUrl) {
      return (!result.sync && result.reason === "no-cernere-url" && result.level === "info")
        || "missing CERNERE_URL must skip with an info log";
    }
    if (!input.clientId || !input.clientSecret) {
      return (!result.sync && result.reason === "missing-credentials" && result.level === "warn")
        || "missing project credentials on a public deployment must skip with a warn log";
    }
    return result.sync || "complete credentials on a public deployment must sync";
  },
};
