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

it("samples successful observations while recording violations and predicate errors", async () => {
  const dir = await mkdtemp(join(tmpdir(), "actio-contract-runtime-"));
  const random = vi.spyOn(Math, "random").mockReturnValue(0.5).mockReturnValueOnce(0.49);
  vi.stubEnv("VESTIGIUM_LOGS_DIR", dir);
  const spec = { contractId: "sample", where: "test", sample: 0.5 };
  try {
    const sync = contract(() => 1, { ...spec, id: "included" });
    const asyncSuccess = contract(async () => 2, { ...spec, id: "skipped" });
    const invalid = contract(() => 3, {
      ...spec,
      id: "violations",
      pre: () => "precondition failed",
      post: () => "postcondition failed",
    });
    const throwing = contract(async () => 4, {
      ...spec,
      id: "errors",
      pre: () => { throw new Error("pre"); },
      post: () => { throw new Error("post"); },
    });

    expect(sync()).toBe(1);
    await expect(asyncSuccess()).resolves.toBe(2);
    expect(invalid()).toBe(3);
    await expect(throwing()).resolves.toBe(4);
    expect(random).toHaveBeenCalledTimes(2);

    await flushContractLogs();
    const [file] = await readdir(dir);
    const log = await readFile(join(dir, file), "utf8");
    const events = log.trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(events).toMatchObject([
      { msg: "contract observed", ctx: { id: "included", phase: "ok" } },
      { msg: "contract violated", ctx: { id: "violations", phase: "pre" } },
      { msg: "contract violated", ctx: { id: "violations", phase: "post" } },
      { msg: "contract predicate threw", ctx: { id: "errors", phase: "pre" } },
      { msg: "contract predicate threw", ctx: { id: "errors", phase: "post" } },
    ]);
  } finally {
    random.mockRestore();
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  }
});

it("records every successful observation when sample is missing, invalid, or 1", async () => {
  const dir = await mkdtemp(join(tmpdir(), "actio-contract-runtime-"));
  const random = vi.spyOn(Math, "random").mockReturnValue(0.99);
  vi.stubEnv("VESTIGIUM_LOGS_DIR", dir);
  try {
    const samples = [undefined, 0, -0.1, 1, 1.1, Number.NaN, Number.POSITIVE_INFINITY];
    const spec = { contractId: "sample", where: "test" };
    for (const sample of samples) {
      const id = String(sample);
      contract(() => true, { ...spec, id, sample })();
    }
    expect(random).not.toHaveBeenCalled();

    await flushContractLogs();
    const [file] = await readdir(dir);
    const log = await readFile(join(dir, file), "utf8");
    const events = log.trimEnd().split("\n").map((line) => JSON.parse(line));
    expect(events).toMatchObject(
      samples.map((sample) => ({ msg: "contract observed", ctx: { id: String(sample), phase: "ok" } })),
    );
  } finally {
    random.mockRestore();
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
