import { describe, expect, it, vi } from "vitest";
import { checkSprintBreaker } from "../../modules/task/autonomous-sprint/breaker.js";
import { canAdvanceLoop } from "../../modules/task/autonomous-sprint/advance.js";
import { ownsLoop } from "../../modules/task/autonomous-sprint/access.js";

describe("Autonomous sprint authority", () => {
  it.each([[200, "allowed"], [409, "open"], [302, "unavailable"], [503, "unavailable"]] as const)("interprets HTTP %i as %s", async (status, result) => {
    const request = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status }));
    expect(await checkSprintBreaker("http://cc.example", undefined, request)).toBe(result);
    expect(request).toHaveBeenCalledWith(new URL("http://cc.example/v1/autonomous-loop/circuit-breaker/check"), expect.objectContaining({
      method: "POST", redirect: "error", body: '{"source":"actio_sprint"}',
    }));
  });

  it("treats missing config, invalid URL and rejected transport as explicit deferrals", async () => {
    const request = vi.fn<typeof fetch>().mockRejectedValue(new Error("offline"));
    expect(await checkSprintBreaker(undefined, undefined, request)).toBe("unavailable");
    expect(await checkSprintBreaker("file:///test", undefined, request)).toBe("unavailable");
    expect(request).not.toHaveBeenCalled();
    expect(await checkSprintBreaker("http://cc.example", undefined, request)).toBe("unavailable");
  });

  it("requires a running loop and a permit for every new trigger, and matches only the authenticated client binding", () => {
    expect(canAdvanceLoop("running", "observe", null)).toBe(true);
    expect(canAdvanceLoop("running", "start_sprint", "open")).toBe(false);
    expect(canAdvanceLoop("running", "start_next_sprint", "unavailable")).toBe(false);
    expect(canAdvanceLoop("paused", "claim_task", "allowed")).toBe(false);
    expect(canAdvanceLoop("running", "claim_task", "allowed")).toBe(true);
    expect(ownsLoop(undefined, "dots")).toBe(false);
    expect(ownsLoop("other", "dots")).toBe(false);
    expect(ownsLoop("dots", "dots")).toBe(true);
  });
});
