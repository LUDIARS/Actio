const SLOW_PHASE_MS = 500;

export async function measureTaskListPhase<T>(
  phase: "db_wait" | "format",
  operation: () => T | Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  const start = performance.now();
  function warn(state: "finished" | "deadline"): void {
    const elapsedMs = performance.now() - start;
    if (state === "deadline" || elapsedMs >= SLOW_PHASE_MS) {
      // Actio captures console warnings through Vestigium at startup.
      console.warn(`[task-list] slow page phase=${phase} state=${state} elapsed_ms=${Math.round(elapsedMs)}`);
    }
  }
  const onDeadline = (): void => warn("deadline");
  signal?.addEventListener("abort", onDeadline, { once: true });
  try {
    return await operation();
  } finally {
    signal?.removeEventListener("abort", onDeadline);
    if (!signal?.aborted) warn("finished");
  }
}
