import { describe, expect, it } from "vitest";
import { readExecutorFields, resolveExecutor } from "../../modules/task/validation/executor.js";

describe("resolveExecutor", () => {
  it("defaults new tasks to human", () => {
    expect(resolveExecutor(null, { executorType: undefined, aiExecutor: undefined })).toEqual({ value: { executorType: "human", aiExecutor: null } });
  });

  it("accepts an AI executor label", () => {
    expect(resolveExecutor(null, { executorType: "ai", aiExecutor: "codex/impl-from-design" }).value)
      .toEqual({ executorType: "ai", aiExecutor: "codex/impl-from-design" });
  });

  it("rejects ai_executor on human work and unknown types", () => {
    expect(resolveExecutor(null, { executorType: "human", aiExecutor: "codex" }).error).toContain("only allowed");
    expect(resolveExecutor(null, { executorType: "robot", aiExecutor: undefined }).error).toContain("human or ai");
    expect(resolveExecutor(null, { executorType: "ai", aiExecutor: "has space" }).error).toContain("ai_executor");
  });

  it("clears the AI label when switching back to human and keeps it on unrelated updates", () => {
    const current = { executorType: "ai" as const, aiExecutor: "opus" };
    expect(resolveExecutor(current, { executorType: "human", aiExecutor: undefined }).value).toEqual({ executorType: "human", aiExecutor: null });
    expect(resolveExecutor(current, { executorType: undefined, aiExecutor: undefined }).value).toEqual(current);
  });

  it("reads camelCase and snake_case fields", () => {
    expect(readExecutorFields({ executor_type: "ai", ai_executor: "opus" })).toEqual({ executorType: "ai", aiExecutor: "opus" });
    expect(readExecutorFields({ executorType: "human" })).toEqual({ executorType: "human", aiExecutor: undefined });
  });
});
