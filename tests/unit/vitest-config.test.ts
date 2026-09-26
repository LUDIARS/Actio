import { describe, expect, it } from "vitest";
import config from "../../vitest.config.js";

// The API suites import src/app.ts in beforeAll; run in parallel forks they time out.
describe("vitest config — serial test files", () => {
  it("runs one test file at a time", () => {
    expect(config.test?.maxWorkers).toBe(1);
  });

  it("does not rely on test.poolOptions, which Vitest 4 ignores", () => {
    expect(config.test).not.toHaveProperty("poolOptions");
  });
});
