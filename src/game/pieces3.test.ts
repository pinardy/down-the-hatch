// Mud, narrow bridges, the fox, conveyor belts, curious chickens and changeable chickens.
import { describe, expect, it } from "vitest";
import { blockedBy, parseLevel, startState, step } from "./engine";
import { solve } from "./solver";
import type { Dir, GameState, Level, LevelDef } from "./types";

const level = (rows: string[], hatches: LevelDef["hatches"], extra: Partial<LevelDef> = {}) => parseLevel({ id: "t", name: "t", rows, hatches, par: 1, ...extra }, 0);
const go = (l: Level, s: GameState, id: number, ...dirs: Dir[]) => {
  for (const d of dirs) {
    const out = step(l, s, id, d);
    if (!out) throw new Error(`${id} ${d} refused: ${JSON.stringify(blockedBy(l, s, id, d))}`);
    s = out.state;
  }
  return s;
};
const at = (s: GameState, id: number) => {
  const t = s.hatches.find((h) => h.id === id)!;
  return [t.x, t.y];
};
const bird = (s: GameState, id = 0) => {
  const c = s.chickens.find((b) => b.id === id)!;
  return [c.x, c.y];
};

describe("mud", () => {
  const l = level([".m..r", "b...."], [{ color: "red", x: 0, y: 0, cap: 1 }, { color: "blue", x: 4, y: 1, cap: 1 }]);
  it("holds a hatch until another hatch has moved", () => {
    const out = step(l, startState(l), 0, "right")!;
    expect(out.bogged).toBe(true);
    expect(blockedBy(l, out.state, 0, "right")).toEqual({ kind: "mud", hatch: 0 });
    expect(blockedBy(l, out.state, 0, "down")).toEqual({ kind: "mud", hatch: 0 });
    let s = go(l, out.state, 1, "left");
    s = go(l, s, 0, "right", "right", "right"); // free again, and off the mud
    expect(s.chickens).toHaveLength(1);
    expect(s.moves).toBe(3);
  });
  it("stops a slide on slippery floor", () => {
    const m = level(["._m_.", "r...b"], [{ color: "red", x: 0, y: 0, cap: 1 }, { color: "blue", x: 4, y: 0, cap: 1 }]);
    const out = step(m, startState(m), 0, "right")!;
    expect(at(out.state, 0)).toEqual([2, 0]);
  });
});

describe("narrow bridges", () => {
  it("only take hatches of one or two squares", () => {
    const l = level(["..:.", "..:.", "r..."], [{ color: "red", x: 0, y: 0, w: 2, cap: 1 }]);
    expect(step(l, startState(l), 0, "right")).not.toBeNull();
    const m = level(["...:", "r..."], [{ color: "red", x: 0, y: 0, w: 3, cap: 1 }]);
    expect(blockedBy(m, startState(m), 0, "right")).toEqual({ kind: "bridge", x: 3, y: 0 });
  });
});

describe("the fox", () => {
  const l = level(["f...r", ".....", "b...."], [{ color: "red", x: 2, y: 2, cap: 1 }, { color: "blue", x: 4, y: 2, cap: 1 }]);
  it("walks a square towards the nearest chicken each new move, not each square", () => {
    let s = go(l, startState(l), 0, "up"); // a new move: the fox goes for the blue chicken, two squares down
    expect(s.fox).toBe(5);
    s = go(l, s, 0, "up"); // the same move: it waits
    expect(s.fox).toBe(5);
  });
  it("loses the level if it gets one", () => {
    let s = go(l, startState(l), 0, "up");
    const out = step(l, s, 1, "up")!;
    expect(out.caught).toBe(true);
    s = out.state;
    expect(s.lost).toBe(true);
    expect(blockedBy(l, s, 0, "up")).toEqual({ kind: "lost" });
    expect(solve(l, s, 1000).status).toBe("stuck");
  });
  it("can be kept out by a hatch in its way, and is in the way itself", () => {
    const m = level(["f.#.r", "###..", "....."], [{ color: "red", x: 1, y: 2, cap: 1 }]);
    const s = go(m, startState(m), 0, "right"); // walled in: nowhere to go
    expect(s.fox).toBe(0);
    const n = level(["f.r", "..."], [{ color: "red", x: 1, y: 1, cap: 1 }]);
    const t = go(n, startState(n), 0, "left"); // the fox comes to 1,0
    expect(t.fox).toBe(1);
    expect(blockedBy(n, t, 0, "up")).toBeNull(); // 0,0 is free now
    expect(blockedBy(n, go(n, t, 0, "up"), 0, "right")).toEqual({ kind: "fox", x: 1, y: 0 });
  });
  it("is beaten by clearing the coop first, or by standing a hatch in its way", () => {
    expect(solve(l, startState(l), 50_000).status).toBe("solved"); // the red hatch can block it
    const quick = level(["f...r", "....."], [{ color: "red", x: 4, y: 1, cap: 1 }]);
    expect(solve(quick, startState(quick), 50_000)).toMatchObject({ status: "solved", moves: 1 });
  });
});

describe("conveyor belts", () => {
  const l = level(["r....", ".....", "....."], [{ color: "red", x: 4, y: 2, cap: 1 }], { belts: [[0, 0, "right"], [1, 0, "right"], [2, 0, "down"]] });
  it("carry a chicken one square each new move", () => {
    let s = go(l, startState(l), 0, "left");
    expect(bird(s)).toEqual([1, 0]);
    s = go(l, s, 0, "left"); // the same move
    expect(bird(s)).toEqual([1, 0]);
  });
  it("stop at something in the way", () => {
    const m = level(["r#...", "....."], [{ color: "red", x: 4, y: 1, cap: 1 }], { belts: [[0, 0, "right"]] });
    expect(bird(go(m, startState(m), 0, "left"))).toEqual([0, 0]);
  });
});

describe("curious chickens", () => {
  const l = level(["r....", "....."], [{ color: "red", x: 1, y: 0, cap: 1 }], { curious: [[0, 0]] });
  it("follow a hatch that slides away from right in front of them", () => {
    // the hatch at 1,0 leads the chicken along the row
    const s = go(l, startState(l), 0, "right");
    expect(bird(s)).toEqual([1, 0]);
    expect(bird(go(l, s, 0, "right"))).toEqual([2, 0]);
  });
  it("stay put when the hatch goes another way", () => {
    expect(bird(go(l, startState(l), 0, "down"))).toEqual([0, 0]);
  });
});

describe("changeable chickens", () => {
  const l = level(["r...", "....", "...."], [{ color: "blue", x: 1, y: 0, cap: 1 }], { fickle: [[0, 0, "b"]] });
  it("swap colour once each new move, after its first square", () => {
    // red now: the blue hatch can't take it on the first square of a move
    expect(blockedBy(l, startState(l), 0, "left")?.kind).toBe("chicken");
    let s = go(l, startState(l), 0, "right"); // a move starts: it turns blue
    expect(s.chickens[0].color).toBe("blue");
    s = go(l, s, 0, "left", "left"); // the same move: still blue, and taken
    expect(s.chickens).toHaveLength(0);
  });
});
