import { describe, expect, it } from "vitest";
import { spring, stiffness } from "./useGlide";

/** Run the spring from `x` at speed `v` towards 0, a frame at a time; every position on the way. */
const run = (x: number, v: number, omega: number, dt: number, frames: number) => {
  const seen: number[] = [];
  for (let i = 0; i < frames; i++) {
    ({ x, v } = spring(x, v, 0, dt, omega));
    seen.push(x);
  }
  return seen;
};

describe("the spring a held hatch follows the finger on", () => {
  it("arrives, and from rest never overshoots", () => {
    const seen = run(-1, 0, 90, 1 / 60, 30);
    expect(seen.every((x) => x <= 0)).toBe(true);
    expect(seen.every((x, i) => i === 0 || x >= seen[i - 1])).toBe(true);
    expect(Math.abs(seen[seen.length - 1])).toBeLessThan(0.001);
  });
  it("starts gently: the first frame covers less than the second", () => {
    const [a, b] = run(-1, 0, 90, 1 / 120, 2);
    expect(a + 1).toBeLessThan(b - a);
  });
  it("comes to the same place however the time is cut into frames", () => {
    const fine = run(-1, 3, 70, 1 / 240, 48);
    const coarse = run(-1, 3, 70, 1 / 30, 6);
    expect(coarse[5]).toBeCloseTo(fine[47], 6);
  });
  it("stays steady through a very long frame", () => {
    const { x, v } = spring(-2, 40, 0, 0.5, 90);
    expect(Math.abs(x)).toBeLessThan(0.001);
    expect(Math.abs(v)).toBeLessThan(0.001);
  });
  it("following a steady finger, settles a fixed distance behind it and does not pass it when it stops", () => {
    // The finger moves at 6 squares a second, then stops dead.
    let x = 0;
    let v = 0;
    let to = 0;
    for (let i = 0; i < 60; i++) {
      to += 6 / 120;
      ({ x, v } = spring(x, v, to, 1 / 120, 90));
    }
    expect(to - x).toBeCloseTo((2 * 6) / 90, 1);
    let furthest = x;
    for (let i = 0; i < 60; i++) {
      ({ x, v } = spring(x, v, to, 1 / 120, 90));
      furthest = Math.max(furthest, x);
    }
    expect(furthest).toBeLessThanOrEqual(to + 1e-9);
    expect(to - x).toBeLessThan(0.001);
  });
  it("is stiff close behind the finger and softer with ground to make up", () => {
    expect(stiffness(0)).toBe(stiffness(0.2));
    expect(stiffness(0.45)).toBeLessThan(stiffness(0.2));
    expect(stiffness(0.7)).toBeLessThan(stiffness(0.45));
    expect(stiffness(3)).toBe(stiffness(0.7));
  });
});
