type WriteBatch = (lines: readonly string[]) => Promise<void>;

interface BufferOptions {
  batchSize: number;
  maxPending: number;
  delayMs: number;
}

interface ContractLogBuffer {
  enqueue(line: string): void;
  flush(): Promise<void>;
}

/** @implements AT-TASK-LIST-STALL */
export function createContractLogBuffer(write: WriteBatch, options: BufferOptions): ContractLogBuffer {
  const pending: string[] = [];
  let timer: NodeJS.Timeout | undefined;
  let draining: Promise<void> | undefined;

  async function drain(): Promise<void> {
    try {
      while (pending.length > 0) {
        const batch = pending.splice(0, options.batchSize);
        try {
          await write(batch);
        } catch {
          // Contract logging is best-effort. A failed batch must not block the next one.
        }
      }
    } finally {
      draining = undefined;
    }
  }

  function flush(): Promise<void> {
    clearTimeout(timer);
    timer = undefined;
    if (draining) return draining;
    if (pending.length === 0) return Promise.resolve();
    draining = Promise.resolve().then(drain);
    return draining;
  }

  return {
    enqueue(line): void {
      if (pending.length >= options.maxPending) return;
      pending.push(line);
      if (draining) return;
      const batchReady = pending.length === options.batchSize;
      if (!timer || batchReady) {
        clearTimeout(timer);
        timer = setTimeout(() => void flush(), batchReady ? 0 : options.delayMs);
        timer.unref();
      }
    },
    flush,
  };
}
