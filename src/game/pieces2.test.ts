// Mirrored pairs, levers and doors, tired hatches, the pecking order, fences and stacked chickens.
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

describe("mirrored hatches", () => {
  const l = level(["......", "r....b"], [{ color: "red", x: 2, y: 0, cap: 1, mirror: "a" }, { color: "blue", x: 3, y: 0, cap: 1, mirror: "a" }]);
  it("slide opposite ways, as one move", () => {
    const s = go(l, startState(l), 0, "left");
    expect([at(s, 0), at(s, 1)]).toEqual([[1, 0], [4, 0]]);
    const t = go(l, s, 1, "right"); // moving the other one is the same move
    expect([at(t, 0), at(t, 1)]).toEqual([[0, 0], [5, 0]]);
    expect(t.moves).toBe(1);
  });
  it("can't run into each other", () => {
    expect(blockedBy(l, startState(l), 0, "right")).toEqual({ kind: "hatch", id: 1 });
    const m = level([".....", "r...b"], [{ color: "red", x: 1, y: 0, cap: 1, mirror: "a" }, { color: "blue", x: 3, y: 0, cap: 1, mirror: "a" }]);
    expect(step(m, startState(m), 0, "right")).toBeNull(); // both onto the middle square
  });
  it("don't move at all if either is blocked", () => {
    const s = go(l, startState(l), 0, "left", "left");
    expect(blockedBy(l, s, 0, "left")).toEqual({ kind: "edge" }); // the blue one is at the edge too
    expect(step(l, s, 0, "left")).toBeNull();
  });
  it("go their own ways once one has shut", () => {
    const m = level(["r.....", "....b."], [{ color: "red", x: 1, y: 0, cap: 1, mirror: "a" }, { color: "blue", x: 4, y: 0, cap: 1, mirror: "a" }]);
    let s = go(m, startState(m), 0, "left"); // red takes its chicken and shuts; blue goes right
    expect(s.hatches.map((t) => t.id)).toEqual([1]);
    s = go(m, s, 1, "left", "down"); // free now: left is just left
    expect(s.chickens).toHaveLength(0);
  });
});

describe("levers and doors", () => {
  const l = level([".%.+.r", "...-.."], [{ color: "red", x: 0, y: 0, cap: 1 }]);
  it("a shut door can't be entered; an open one can", () => {
    const s = go(l, startState(l), 0, "down", "right", "right", "right"); // into the open door below
    expect(at(s, 0)).toEqual([3, 1]);
    expect(blockedBy(l, s, 0, "up")).toEqual({ kind: "door", x: 3, y: 0 });
  });
  it("crossing a lever flips every door", () => {
    const out = step(l, startState(l), 0, "right")!;
    expect(out.flipped).toBe(true);
    const s = go(l, out.state, 0, "right", "right", "right", "right"); // the top door is open now
    expect(s.chickens).toHaveLength(0);
    // ...and the one that started open is shut
    const t = go(l, startState(l), 0, "right", "down", "right");
    expect(blockedBy(l, t, 0, "right")).toEqual({ kind: "door", x: 3, y: 1 });
  });
  it("crossing it again flips them back", () => {
    const s = go(l, startState(l), 0, "right", "left", "right");
    expect(s.flipped).toBe(false);
  });
  it("need each other", () => {
    expect(() => level([".+.", "r.."], [{ color: "red", x: 0, y: 0, cap: 1 }])).toThrow();
    expect(() => level([".%.", "r.."], [{ color: "red", x: 0, y: 0, cap: 1 }])).toThrow();
  });
});

describe("tired hatches", () => {
  const l = level(["r...", "...b"], [{ color: "red", x: 2, y: 0, cap: 1, uses: 1 }, { color: "blue", x: 0, y: 1, cap: 1 }]);
  it("can be picked up only so many times; going on with one is the same move", () => {
    let s = go(l, startState(l), 0, "down", "left"); // one move
    expect(s.hatches[0].uses).toBe(0);
    s = go(l, s, 0, "up"); // still the same move
    s = go(l, s, 1, "right");
    expect(blockedBy(l, s, 0, "left")).toEqual({ kind: "tired", hatch: 0 });
  });
});

describe("the pecking order", () => {
  const l = level(["r.r", "..."], [{ color: "red", x: 1, y: 0, cap: 2 }], { order: [[2, 0], [0, 0]] });
  it("makes chickens wait their turn", () => {
    expect(blockedBy(l, startState(l), 0, "left")).toEqual({ kind: "order", id: 0, hatch: 0, need: 1 });
    const s = go(l, startState(l), 0, "right", "left", "left");
    expect(s.chickens).toHaveLength(0);
  });
  it("lets two go at once if they are next in line together", () => {
    const m = level(["rr", ".."], [{ color: "red", x: 0, y: 1, w: 2, cap: 2 }], { order: [[1, 0], [0, 0]] });
    expect(step(m, startState(m), 0, "up")?.dropped).toHaveLength(2);
  });
});

describe("fences", () => {
  it("stop a hatch crossing them, under any of its squares", () => {
    const l = level(["...", "r.."], [{ color: "red", x: 0, y: 0, w: 2, cap: 1 }], { fences: [[0, 0, "right"]] });
    expect(blockedBy(l, startState(l), 0, "right")).toEqual({ kind: "fence", x: 0, y: 0, dir: "right" });
    expect(step(l, startState(l), 0, "down")).not.toBeNull();
  });
  it("stop crates and skittish chickens too", () => {
    const l = level([".@.", "r.."], [{ color: "red", x: 0, y: 0, cap: 1 }], { fences: [[1, 0, "right"]] });
    expect(blockedBy(l, startState(l), 0, "right")).toEqual({ kind: "crate", x: 1, y: 0 });
    const free = level(["...", ".r.", "..."], [{ color: "red", x: 0, y: 0, cap: 1 }], { skittish: [[1, 1]] });
    expect(go(free, startState(free), 0, "down").chickens[0]).toMatchObject({ x: 1, y: 2 }); // shooed down
    const fence = level(["...", ".r.", "..."], [{ color: "red", x: 0, y: 0, cap: 1 }], { skittish: [[1, 1]], fences: [[1, 1, "down"]] });
    expect(go(fence, startState(fence), 0, "down").chickens[0]).toMatchObject({ x: 1, y: 1 }); // the fence keeps it in
  });
  it("are read the same from both sides", () => {
    const l = level(["...", "r.."], [{ color: "red", x: 1, y: 0, cap: 1 }], { fences: [[0, 0, "right"]] });
    expect(blockedBy(l, startState(l), 0, "left")).toEqual({ kind: "fence", x: 1, y: 0, dir: "left" });
  });
});

describe("stacked chickens", () => {
  // A blue chicken on top of a red one at the corner, and another blue one.
  const l = level(["b..", "...", "..b"], [{ color: "red", x: 2, y: 0, cap: 1 }, { color: "blue", x: 0, y: 1, cap: 2 }], { under: [[0, 0, "r"]] });
  it("the top one has to go first", () => {
    const s = go(l, startState(l), 0, "left");
    expect(blockedBy(l, s, 0, "left")).toEqual({ kind: "chicken", id: 0, hatch: 0 });
  });
  it("the one underneath waits for a hatch to slide onto the square again", () => {
    let s = go(l, startState(l), 1, "up"); // blue takes the top one, and sits over the red
    expect(s.chickens.map((c) => c.color)).toEqual(["blue", "red"]);
    s = go(l, s, 1, "down"); // off again: the red one is still there
    expect(s.chickens.map((c) => c.color)).toEqual(["blue", "red"]);
    s = go(l, s, 0, "left", "left");
    expect(s.chickens.map((c) => c.color)).toEqual(["blue"]);
  });
  it("are solved like any other board", () => {
    const r = solve(l, startState(l), 50_000);
    expect(r).toMatchObject({ status: "solved", moves: 2 });
  });
});
