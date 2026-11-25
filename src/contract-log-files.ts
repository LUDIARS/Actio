import { appendFile, mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const LOG_FILENAME = /^contracts-actio-(\d{4}-\d{2}-\d{2})-[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.jsonl$/;

type WriteContractLog = (directory: string, retentionDays: number, lines: readonly string[]) => Promise<void>;

async function prune(directory: string, cutoffMs: number): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const day = LOG_FILENAME.exec(entry.name)?.[1];
    if (entry.isFile() && day && Date.parse(`${day}T00:00:00Z`) < cutoffMs) {
      await rm(join(directory, entry.name), { force: true });
    }
  }
}

/** @implements AT-TASK-LIST-STALL */
export function createContractLogWriter(writerId: string, now: () => number = Date.now): WriteContractLog {
  let lastPruned: string | undefined;
  return async (directory, retentionDays, lines): Promise<void> => {
    const day = new Date(now() + JST_OFFSET_MS).toISOString().slice(0, 10);
    // A per-process shard avoids concurrent appends to the same file. Keep it at
    // the top level so Augur's JSONL reader includes it in contract reports.
    const filename = `contracts-actio-${day}-${writerId}.jsonl`;
    await mkdir(directory, { recursive: true });
    await appendFile(join(directory, filename), lines.join(""), "utf8");

    const pruneKey = join(directory, day);
    if (lastPruned !== pruneKey) {
      lastPruned = pruneKey;
      const cutoff = Date.parse(`${day}T00:00:00Z`) - retentionDays * DAY_MS;
      await prune(directory, cutoff);
    }
  };
}
