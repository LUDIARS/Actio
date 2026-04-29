import { describe, it, expect } from "vitest";
import {
  haversineMeters,
  findCurrentPlace,
  diffTransitions,
} from "../modules/placement/engine.js";

describe("haversineMeters", () => {
  it("returns ~0 for identical points", () => {
    expect(haversineMeters(35.681, 139.767, 35.681, 139.767)).toBeLessThan(1);
  });

  it("Tokyo Tower → Shibuya is roughly 5–7 km", () => {
    // Tokyo Tower (35.6586, 139.7454) ↔ Shibuya station (35.6580, 139.7016)
    const d = haversineMeters(35.6586, 139.7454, 35.6580, 139.7016);
    expect(d).toBeGreaterThan(3000);
    expect(d).toBeLessThan(7000);
  });

  it("symmetric: a→b == b→a", () => {
    const a = haversineMeters(35.0, 139.0, 36.0, 140.0);
    const b = haversineMeters(36.0, 140.0, 35.0, 139.0);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});

describe("findCurrentPlace", () => {
  const home = { id: "home", lat: 35.681, lon: 139.767, radiusM: 100 };
  const office = { id: "office", lat: 35.690, lon: 139.700, radiusM: 200 };

  it("returns null when outside all places", () => {
    // 北極寄り
    expect(findCurrentPlace(40.0, 100.0, [home, office])).toBeNull();
  });

  it("returns the place containing the point", () => {
    const r = findCurrentPlace(35.681, 139.767, [home, office]);
    expect(r?.id).toBe("home");
  });

  it("when overlapping radii, picks the closer center", () => {
    const small = { id: "small", lat: 35.681, lon: 139.767, radiusM: 50 };
    const big = { id: "big", lat: 35.682, lon: 139.768, radiusM: 5000 };
    // 35.681,139.767 は small の中心、 big からは ~150m 離れる → small が選ばれる
    const r = findCurrentPlace(35.681, 139.767, [big, small]);
    expect(r?.id).toBe("small");
  });
});

describe("diffTransitions", () => {
  it("returns empty when same place", () => {
    expect(diffTransitions("a", "a")).toEqual([]);
    expect(diffTransitions(null, null)).toEqual([]);
  });

  it("emits enter when entering from null", () => {
    expect(diffTransitions(null, "home")).toEqual([
      { type: "enter", placeId: "home" },
    ]);
  });

  it("emits leave when leaving to null", () => {
    expect(diffTransitions("home", null)).toEqual([
      { type: "leave", placeId: "home" },
    ]);
  });

  it("emits leave-then-enter when switching", () => {
    expect(diffTransitions("home", "office")).toEqual([
      { type: "leave", placeId: "home" },
      { type: "enter", placeId: "office" },
    ]);
  });
});
