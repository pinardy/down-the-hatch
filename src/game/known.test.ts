import { describe, expect, it } from "vitest";
import { boardKey, decodeSteps, encodeSteps, knownWay } from "./known";
import { LEVELS } from "./levels";
import { SOLUTIONS } from "./solutions";
import { startState, step } from "./engine";

describe("stored solutions", () => {
  it("encode and decode back to the same steps", () => {
    const steps = [
      { hatch: 0, dir: "down" as const },
      { hatch: 0, dir: "right" as const },
      { hatch: 1, dir: "left" as const },
      { hatch: 0, dir: "up" as const },
    ];
    expect(encodeSteps(steps)).toBe("0dr1l0u");
    expect(decodeSteps("0dr1l0u")).toEqual(steps);
    expect(decodeSteps("dr")).toBeNull();
    expect(decodeSteps("0x")).toBeNull();
  });

  it("there is one for every level and no others (run `npm run solutions` after changing levels)", () => {
    expect(Object.keys(SOLUTIONS).sort()).toEqual(LEVELS.map((l) => l.id).sort());
  });

  it.each(LEVELS.map((l) => [l.id, l] as const))("%s: the stored solution clears it in par", (_id, level) => {
    const steps = decodeSteps(SOLUTIONS[level.id])!;
    let state = startState(level);
    for (const s of steps) {
      const out = step(level, state, s.hatch, s.dir);
      expect(out, `${s.hatch} ${s.dir}`).not.toBeNull();
      state = out!.state;
    }
    expect(state.chickens).toHaveLength(0);
    expect(state.moves).toBe(level.par);
  });

  it("gives the rest of the way from any position on it, however many moves it took to get there", () => {
    const level = LEVELS.find((l) => l.id === "sinkhole")!;
    const way = knownWay(level)!;
    const start = startState(level);
    expect(way.get(boardKey(start))).toMatchObject({ status: "solved", moves: level.par });
    const steps = decodeSteps(SOLUTIONS[level.id])!;
    // One square into the solution, reached in more moves than it takes.
    const state = { ...step(level, start, steps[0].hatch, steps[0].dir)!.state, moves: 9, lastHatch: null };
    const rest = way.get(boardKey(state));
    expect(rest?.status).toBe("solved");
    if (rest?.status === "solved") expect(rest.steps).toEqual(steps.slice(1));
  });

  it("knows nothing of boards without a stored solution", () => {
    expect(knownWay({ ...LEVELS[0], id: "not-a-level" })).toBeNull();
  });
});
