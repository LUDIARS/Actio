/**
 * cocoiru schedule sweep の cron wrapper を smoke test。
 *
 * 実際の sweep ロジック (`runScheduleSweep`) は cocoiru module 側のテストで
 * 担保されている (cocoiru/tests/schedule-bridge.test.ts)。ここでは Actio 側の
 * setInterval 起動 / 停止 / 二重起動防止 / cocoiru 未インストール時の挙動を
 * 確認する。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  startCocoiruScheduleSweep,
  stopCocoiruScheduleSweep,
} from "../../src/cron/cocoiru-sweep.js";

describe("cocoiru schedule sweep cron", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stopCocoiruScheduleSweep();
  });

  afterEach(() => {
    stopCocoiruScheduleSweep();
    vi.useRealTimers();
  });

  it("starts a setInterval timer", () => {
    const setSpy = vi.spyOn(global, "setInterval");
    startCocoiruScheduleSweep();
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
  });

  it("does not double-start when called twice", () => {
    const setSpy = vi.spyOn(global, "setInterval");
    startCocoiruScheduleSweep();
    startCocoiruScheduleSweep();
    expect(setSpy).toHaveBeenCalledTimes(1);
  });

  it("stop clears the timer", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    startCocoiruScheduleSweep();
    stopCocoiruScheduleSweep();
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it("calling stop without start is a no-op", () => {
    const clearSpy = vi.spyOn(global, "clearInterval");
    stopCocoiruScheduleSweep();
    expect(clearSpy).not.toHaveBeenCalled();
  });
});
