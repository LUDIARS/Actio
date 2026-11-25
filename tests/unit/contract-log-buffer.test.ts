import { afterEach, describe, expect, it, vi } from "vitest";
import { createContractLogBuffer } from "../../src/contract-log-buffer.js";

afterEach(() => vi.useRealTimers());

describe("contract log buffer", () => {
  it("flushes a partial batch on the timer", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async (_batch: readonly string[]) => {});
    const buffer = createContractLogBuffer(write, { batchSize: 2, maxPending: 4, delayMs: 250 });
    buffer.enqueue("first\n");
    await vi.advanceTimersByTimeAsync(249);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledExactlyOnceWith(["first\n"]);
  });

  it("schedules full batches off the caller stack and flushes the tail on shutdown", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async (_batch: readonly string[]) => {});
    const buffer = createContractLogBuffer(write, { batchSize: 2, maxPending: 4, delayMs: 250 });
    buffer.enqueue("a\n");
    buffer.enqueue("b\n");
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenNthCalledWith(1, ["a\n", "b\n"]);
    buffer.enqueue("c\n");
    await buffer.flush();
    expect(write).toHaveBeenNthCalledWith(2, ["c\n"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("bounds the queue, coalesces concurrent flushes and continues after a failed write", async () => {
    vi.useFakeTimers();
    const failure = Promise.withResolvers<void>();
    const write = vi.fn(async (_batch: readonly string[]) => {}).mockReturnValueOnce(failure.promise);
    const buffer = createContractLogBuffer(write, { batchSize: 2, maxPending: 2, delayMs: 250 });
    buffer.enqueue("a\n");
    buffer.enqueue("b\n");
    const draining = buffer.flush();
    await Promise.resolve();
    buffer.enqueue("c\n");
    buffer.enqueue("d\n");
    buffer.enqueue("dropped\n");
    expect(buffer.flush()).toBe(draining);
    expect(write).toHaveBeenCalledTimes(1);
    failure.reject(new Error("disk unavailable"));
    await draining;
    expect(write.mock.calls).toEqual([[["a\n", "b\n"]], [["c\n", "d\n"]]]);
  });
});
