import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { createContractLogWriter } from "../../src/contract-log-files.js";

it("writes to a new file at JST midnight and prunes only expired Actio shards", async () => {
  const dir = await mkdtemp(join(tmpdir(), "actio-contracts-"));
  const writerId = "11111111-1111-4111-8111-111111111111";
  const legacy = "contracts.jsonl";
  const foreign = `contracts-other-2026-11-01-${writerId}.jsonl`;
  const expired = `contracts-actio-2026-11-18-${writerId}.jsonl`;
  const yesterday = `contracts-actio-2026-11-25-${writerId}.jsonl`;
  const today = `contracts-actio-2026-11-26-${writerId}.jsonl`;
  try {
    for (const name of [legacy, foreign, expired]) await writeFile(join(dir, name), "existing\n", "utf8");
    let now = Date.parse("2026-11-25T14:59:59.999Z");
    const write = createContractLogWriter(writerId, () => now);
    await write(dir, 7, ["one\n", "two\n"]);
    expect(await readFile(join(dir, expired), "utf8")).toBe("existing\n");
    now += 1;
    await write(dir, 7, ["three\n"]);
    expect((await readdir(dir)).sort()).toEqual([legacy, foreign, yesterday, today].sort());
    expect(await readFile(join(dir, yesterday), "utf8")).toBe("one\ntwo\n");
    expect(await readFile(join(dir, today), "utf8")).toBe("three\n");
    expect(await readFile(join(dir, legacy), "utf8")).toBe("existing\n");
    expect(await readFile(join(dir, foreign), "utf8")).toBe("existing\n");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
