// Sleeping chickens, magnets, blades and bombs.
import { describe, expect, it } from "vitest";
import { blockedBy, hayNow, parseLevel, startState, step } from "./engine";
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

describe("sleeping chickens", () => {
  const l = level(["r...", "...b"], [{ color: "red", x: 2, y: 0, cap: 1 }, { color: "blue", x: 0, y: 1, cap: 1 }], { asleep: [[0, 0]] });
  it("can't be taken asleep, nor in the move that wakes them", () => {
    const out = step(l, startState(l), 0, "left")!; // stops right beside it
    expect(out.woke).toBe(true);
    expect(blockedBy(l, out.state, 0, "left")).toEqual({ kind: "asleep", id: 0, hatch: 0 });
  });
  it("can be taken from the next move on, by whichever hatch woke them or another", () => {
    let s = go(l, startState(l), 0, "left");
    s = go(l, s, 1, "right");
    s = go(l, s, 0, "left");
    expect(s.chickens.map((c) => c.color)).toEqual(["blue"]);
  });
  it("need a second hatch: one alone can wake it but never start a new move", () => {
    const m = level(["r..", "..."], [{ color: "red", x: 2, y: 0, cap: 1 }], { asleep: [[0, 0]] });
    expect(solve(m, startState(m), 10_000).status).toBe("stuck");
    expect(solve(l, startState(l), 10_000)).toMatchObject({ status: "solved", moves: 2 }); // the blue hatch wakes it in passing
  });
});

describe("magnets", () => {
  const l = level(["&...", "....", "r..b"], [{ color: "red", x: 3, y: 0, cap: 1 }, { color: "blue", x: 1, y: 1, cap: 1 }]);
  it("are posts, and pull the other hatches in their row or column a square each new move", () => {
    expect(hayNow(l, startState(l))[0]).toBe(true);
    let s = go(l, startState(l), 1, "down"); // blue moves: red, in the magnet's row, is pulled left
    expect(at(s, 0)).toEqual([2, 0]);
    s = go(l, s, 1, "right"); // the same move: no more pulling
    expect(at(s, 0)).toEqual([2, 0]);
    s = go(l, s, 0, "down", "left", "left"); // red moves itself, into the magnet's column: blue is out of line, and stays
    expect(at(s, 1)).toEqual([2, 2]);
    s = go(l, s, 1, "up"); // blue moves: red is right below the post, and can't be pulled onto it
    expect(at(s, 0)).toEqual([0, 1]);
  });
  it("don't pull the hatch being moved, or through what is in the way", () => {
    const s = go(l, startState(l), 0, "down");
    expect(at(s, 0)).toEqual([3, 1]);
    const m = level(["&#..", "....", "r..b"], [{ color: "red", x: 3, y: 0, cap: 1 }, { color: "blue", x: 1, y: 1, cap: 1 }]);
    const t = go(m, startState(m), 1, "down", "right"); // red would be pulled left twice, but the hay stops it at once
    expect(at(t, 0)).toEqual([2, 0]);
    expect(at(go(m, go(m, t, 0, "down", "up"), 1, "left"), 0)).toEqual([2, 0]);
  });
});

describe("blades", () => {
  const l = level(["../.", "rr.."], [{ color: "red", x: 0, y: 0, w: 2, cap: 2 }]);
  it("split a two-square hatch with room for two into two of one square", () => {
    const out = step(l, startState(l), 0, "right")!;
    expect(out.split).toBe(true);
    expect(out.state.hatches.map((t) => [t.id, t.x, t.y, t.cells.length, t.left])).toEqual([[0, 1, 0, 1, 1], [1, 2, 0, 1, 1]]);
    const s = go(l, go(l, out.state, 0, "down"), 1, "left", "left", "down");
    expect(s.chickens).toHaveLength(0);
  });
  it("leave a hatch with room for one alone", () => {
    const m = level(["../.", "r..."], [{ color: "red", x: 0, y: 0, w: 2, cap: 1 }]);
    expect(step(m, startState(m), 0, "right")!.split).toBe(false);
  });
});

describe("bombs", () => {
  const l = level(["..!#r", "...#."], [{ color: "red", x: 0, y: 0, cap: 1 }]);
  it("clear the hay right beside them, once, when a hatch slides on", () => {
    expect(blockedBy(l, go(l, startState(l), 0, "right", "down", "right"), 0, "right")).toEqual({ kind: "bale", x: 3, y: 1 });
    const out = step(l, go(l, startState(l), 0, "right"), 0, "right")!;
    expect(out.boomed).toBe(true);
    expect(hayNow(l, out.state)[3]).toBe(false);
    expect(hayNow(l, out.state)[8]).toBe(true); // not beside the bomb
    const s = go(l, out.state, 0, "right", "right");
    expect(s.chickens).toHaveLength(0);
  });
  it("are found by the search", () => {
    expect(solve(l, startState(l), 10_000)).toMatchObject({ status: "solved", moves: 1 });
  });
});
