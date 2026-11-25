import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { summarizeTaskList } from "../../modules/task/list/summary.js";
import { contract, flushContractLogs } from "../../src/contract-runtime.js";

it("records one verdict for a 500-row page without task data in the log", async () => {
  const dir = await mkdtemp(join(tmpdir(), "actio-contract-runtime-"));
  vi.stubEnv("VESTIGIUM_LOGS_DIR", dir);
  try {
    const rows = Array.from({ length: 500 }, (_, id) => ({ id, description: "task body", pluginPayload: { runs: [] } }));
    const summaries = summarizeTaskList(rows, false);
    await flushContractLogs();
    const files = await readdir(dir);
    expect(files).toHaveLength(1);
    const log = await readFile(join(dir, files[0]), "utf8");
    expect(log.trimEnd().split("\n")).toHaveLength(1);
    expect(JSON.parse(log)).toMatchObject({ msg: "contract observed", ctx: { contract: "C-27", phase: "ok" } });
    expect(log).not.toContain("task body");
    expect(summaries).toHaveLength(500);
  } finally {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  }
});

it("preserves return values and thrown errors when the log directory is unavailable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "actio-contract-runtime-"));
  const file = join(dir, "file");
  const spec = { contractId: "test", id: "test", where: "test" };
  const value = { ok: true };
  const error = new Error("operation failed");
  try {
    await writeFile(file, "file", "utf8");
    vi.stubEnv("VESTIGIUM_LOGS_DIR", file);
    const sync = contract(() => value, spec);
    const asyncFailure = contract(async () => { throw error; }, spec);
    expect(sync()).toBe(value);
    await expect(asyncFailure()).rejects.toBe(error);
    await expect(flushContractLogs()).resolves.toBeUndefined();
  } finally {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  }
});
