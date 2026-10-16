import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionUser, invalidateSessionUser, saveSessionUser } from "../../src/auth/session-cache.js";

const user = { id: "u-1", name: "N", email: "n@example.invalid", role: "member" };

describe("session-cache (in-process, no Redis)", () => {
  afterEach(async () => {
    vi.useRealTimers();
    await invalidateSessionUser(user.id);
  });

  it("returns a saved user until it is invalidated", async () => {
    await saveSessionUser(user);
    expect(await getSessionUser(user.id)).toEqual(user);
    await invalidateSessionUser(user.id);
    expect(await getSessionUser(user.id)).toBeNull();
  });

  it("drops an entry once its TTL has passed", async () => {
    vi.useFakeTimers();
    await saveSessionUser(user, 10);
    vi.advanceTimersByTime(9_000);
    expect(await getSessionUser(user.id)).toEqual(user);
    vi.advanceTimersByTime(2_000);
    expect(await getSessionUser(user.id)).toBeNull();
  });

  it("returns null for an unknown user", async () => {
    expect(await getSessionUser("nobody")).toBeNull();
  });
});
