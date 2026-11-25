import { expect, it, vi } from "vitest";
import { measureTaskListPhase } from "../../modules/task/list/timing.js";

it("identifies the pending DB phase when the page deadline expires", async () => {
  const deadline = new AbortController();
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  try {
    let finish!: (body: string) => void;
    const wait = new Promise<string>((resolve) => { finish = resolve; });
    const measured = measureTaskListPhase("db_wait", () => wait, deadline.signal);
    deadline.abort();
    expect(warning).toHaveBeenCalledWith(expect.stringContaining("phase=db_wait state=deadline"));
    finish("late");
    await expect(measured).resolves.toBe("late");
    expect(warning).toHaveBeenCalledTimes(1);
  } finally {
    warning.mockRestore();
  }
});
