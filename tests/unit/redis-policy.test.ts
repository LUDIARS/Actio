import { describe, expect, it } from "vitest";
import {
  isRedisUsable,
  redisReconnectDelay,
  REDIS_MAX_RECONNECT_DELAY_MS,
  shouldLogReconnect,
} from "../../src/db/redis-policy.js";

describe("redis-policy (Redis is an optional cache)", () => {
  it("never gives up reconnecting and caps the delay", () => {
    expect(redisReconnectDelay(1)).toBe(500);
    expect(redisReconnectDelay(6)).toBe(3000);
    for (const times of [61, 1_000, 100_000]) {
      expect(redisReconnectDelay(times)).toBe(REDIS_MAX_RECONNECT_DELAY_MS);
    }
  });

  it("only treats a ready client as usable", () => {
    expect(isRedisUsable("ready")).toBe(true);
    for (const status of ["connect", "connecting", "reconnecting", "close", "end", "wait"]) {
      expect(isRedisUsable(status)).toBe(false);
    }
  });

  it("thins reconnect logs after the first few attempts", () => {
    expect([1, 2, 3].every(shouldLogReconnect)).toBe(true);
    expect(shouldLogReconnect(4)).toBe(false);
    expect(shouldLogReconnect(40)).toBe(true);
  });
});
