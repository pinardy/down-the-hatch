// The five later pieces: slippery floor, crates, turntables, burrows and skittish chickens.
import { describe, expect, it } from "vitest";
import { blockedBy, parseLevel, startState, step } from "./engine";
import { solve, solveByRules } from "./solver";
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

describe("slippery floor", () => {
  const l = level(["___#.", "r...."], [{ color: "red", x: 0, y: 0, cap: 1 }]);
  it("keeps a hatch sliding until something stops it, all in one move", () => {
    const out = step(l, startState(l), 0, "right")!;
    expect(at(out.state, 0)).toEqual([2, 0]);
    expect(out.slid).toBe(1);
    expect(out.state.moves).toBe(1);
  });
  it("stops once the hatch is off it", () => {
    const m = level([".__.r#"], [{ color: "red", x: 0, y: 0, cap: 1 }]);
    const out = step(m, startState(m), 0, "right")!;
    expect(at(out.state, 0)).toEqual([3, 0]);
    expect(out.slid).toBe(2);
  });
  it("drops chickens on the way, and stops when the hatch fills", () => {
    const m = level(["_r__r", "....."], [{ color: "red", x: 0, y: 0, cap: 1 }, { color: "red", x: 0, y: 1, cap: 1 }]);
    const out = step(m, startState(m), 0, "right")!;
    expect(out.dropped).toHaveLength(1);
    expect(out.shut).toHaveLength(1);
    expect(out.state.hatches.map((t) => t.id)).toEqual([1]);
  });
  it("a hatch already stopped on it slides on whichever way it goes next", () => {
    const s = go(l, startState(l), 0, "right", "down");
    expect(at(s, 0)).toEqual([2, 1]);
  });
});

describe("crates", () => {
  const l = level([".@..", "r..."], [{ color: "red", x: 0, y: 0, cap: 1 }]);
  it("are shoved one square on", () => {
    const out = step(l, startState(l), 0, "right")!;
    expect(out.state.crates).toEqual([2]);
    expect(out.pushed).toEqual([{ id: 0, from: 1, to: 2 }]);
  });
  it("stop at the edge, and say so", () => {
    const s = go(l, startState(l), 0, "right", "right");
    expect(step(l, s, 0, "right")).toBeNull();
    expect(blockedBy(l, s, 0, "right")).toEqual({ kind: "crate", x: 3, y: 0 });
  });
  it("only go onto plain empty floor: not a crate, a chicken, paint or slippery floor", () => {
    for (const row of [".@@.", ".@r.", ".@1.", ".@_."]) {
      const m = level([row, "r..."], [{ color: "red", x: 0, y: 0, cap: row.includes("r") ? 2 : 1 }], {});
      expect(step(m, startState(m), 0, "right"), row).toBeNull();
      expect(blockedBy(m, startState(m), 0, "right")?.kind, row).toBe("crate");
    }
  });
});

describe("turntables", () => {
  const l = level([".....", "..*..", "r...."], [{ color: "red", x: 0, y: 0, shape: ["x.", "xx"], cap: 1 }]);
  it("turn a bent hatch a quarter, clockwise, about the turntable", () => {
    const out = step(l, startState(l), 0, "right")!;
    const t = out.state.hatches[0];
    expect([t.x, t.y]).toEqual([2, 0]);
    expect(t.cells).toEqual([[0, 0], [1, 0], [0, 1]]);
    expect(out.turned).toHaveLength(1);
  });
  it("refuse the slide when there is no room to turn", () => {
    const m = level(["...#.", "..*..", "r...."], [{ color: "red", x: 0, y: 0, shape: ["x.", "xx"], cap: 1 }]);
    expect(step(m, startState(m), 0, "right")).toBeNull();
    expect(blockedBy(m, startState(m), 0, "right")).toEqual({ kind: "turn", x: 2, y: 1 });
  });
  it("leave one-square hatches and hatches on rails as they are", () => {
    const m = level([".*.", "r..", "..."], [{ color: "red", x: 0, y: 0, cap: 1 }]);
    expect(step(m, startState(m), 0, "right")!.turned).toHaveLength(0);
    const n = level(["..*..", "r...."], [{ color: "red", x: 0, y: 0, w: 2, cap: 1, axis: "h" }]);
    expect(step(n, startState(n), 0, "right")!.state.hatches[0].cells).toEqual([[0, 0], [1, 0]]);
  });
  it("four turns bring a hatch back to its shape", () => {
    const m = level([".......", "...*...", ".......", "r......"], [{ color: "red", x: 1, y: 0, shape: ["x.", "xx"], cap: 1 }]);
    let s = startState(m);
    const shapes = new Set<string>();
    for (let i = 0; i < 4; i++) {
      // On and off the turntable, from whichever side is free.
      const dirs: Dir[] = ["right", "left", "down", "up"];
      const on = dirs.map((d) => step(m, s, 0, d)).find((o) => o?.turned.length);
      if (!on) break;
      s = on.state;
      shapes.add(JSON.stringify(s.hatches[0].cells));
      const off = dirs.map((d) => step(m, s, 0, d)).find((o) => o && !o.turned.length);
      s = off!.state;
    }
    expect(shapes.size).toBeGreaterThan(1);
  });
});

describe("burrows", () => {
  const l = level(["(..)", "r..."], [{ color: "red", x: 1, y: 0, cap: 1 }]);
  it("take a one-square hatch to the other end", () => {
    const out = step(l, startState(l), 0, "left")!;
    expect(at(out.state, 0)).toEqual([3, 0]);
    expect(out.burrowed).toBe(true);
  });
  it("are too small for bigger hatches", () => {
    const n = level(["(..)", ".r.."], [{ color: "red", x: 1, y: 0, w: 2, cap: 1 }]);
    expect(blockedBy(n, startState(n), 0, "left")).toEqual({ kind: "burrow", x: 0, y: 0, why: "big" });
  });
  it("won't let a hatch out onto something", () => {
    const m = level(["(..)", "....", "rr.."], [{ color: "red", x: 0, y: 1, cap: 1 }, { color: "red", x: 1, y: 0, cap: 1 }]);
    const s = go(m, startState(m), 1, "left"); // through the burrow: it now sits on the other end
    expect(at(s, 1)).toEqual([3, 0]);
    expect(blockedBy(m, s, 0, "up")).toEqual({ kind: "burrow", x: 0, y: 0, why: "exit" });
  });
  it("need both ends, and no chicken in them", () => {
    expect(() => level(["(...", "r..."], [{ color: "red", x: 1, y: 0, cap: 1 }])).toThrow();
    expect(() => level(["(..)", "...."], [{ color: "red", x: 1, y: 0, cap: 0 }])).toThrow();
  });
});

describe("skittish chickens", () => {
  const l = level(["r.r..", "....."], [{ color: "red", x: 0, y: 1, cap: 2 }], { skittish: [[2, 0]] });
  it("hop one square the way a hatch moved when it stops beside them", () => {
    let s = go(l, startState(l), 0, "up"); // drops the plain chicken at 0,0; not beside the other yet
    expect(s.chickens.find((c) => c.skittish)).toMatchObject({ x: 2, y: 0 });
    const out = step(l, s, 0, "right")!; // to 1,0: beside it, so it hops right
    expect(out.hopped).toHaveLength(1);
    expect(out.state.chickens[0]).toMatchObject({ x: 3, y: 0 });
    s = go(l, out.state, 0, "right", "right"); // pushes it into the corner...
    expect(s.chickens[0]).toMatchObject({ x: 4, y: 0 });
    s = go(l, s, 0, "right"); // ...where it stays put and is caught
    expect(s.chickens).toHaveLength(0);
  });
  it("can be shooed sideways too", () => {
    const m = level(["...", "r..", "..."], [{ color: "red", x: 1, y: 2, cap: 1 }], { skittish: [[0, 1]] });
    const out = step(m, startState(m), 0, "up")!; // stops right beside it, going up: so up it goes
    expect(out.state.chickens[0]).toMatchObject({ x: 0, y: 0 });
  });
  it("must be chickens", () => {
    expect(() => level(["r..", "..."], [{ color: "red", x: 1, y: 1, cap: 1 }], { skittish: [[2, 0]] })).toThrow();
  });
});

describe("the search, with the later pieces", () => {
  it("finds the fewest moves by the game's own rules (a move is one hatch: one hatch, one move)", () => {
    const boards: [string[], LevelDef["hatches"], Partial<LevelDef>, number][] = [
      [["___#.", "r...."], [{ color: "red", x: 0, y: 0, cap: 1 }], {}, 1],
      [[".@..", "...r"], [{ color: "red", x: 0, y: 0, cap: 1 }], {}, 1],
      [["#..#", ".@.r", "#..#"], [{ color: "red", x: 0, y: 1, cap: 1 }], {}, 1],
      [["(..)", ".#.#", "...r"], [{ color: "red", x: 1, y: 0, cap: 1 }], {}, 1],
      [["r.r..", "....."], [{ color: "red", x: 0, y: 1, cap: 2 }], { skittish: [[2, 0]] }, 1],
    ];
    for (const [rows, hatches, extra, moves] of boards) {
      const l = level(rows, hatches, extra);
      const r = solve(l, startState(l), 100_000);
      expect(r.status, rows.join("/")).toBe("solved");
      if (r.status === "solved") {
        expect(r.moves, rows.join("/")).toBe(moves);
        // The steps it gives clear the board.
        let s = startState(l);
        for (const st of r.steps) s = step(l, s, st.hatch, st.dir)!.state;
        expect(s.chickens).toHaveLength(0);
      }
    }
  });
  it("is the same search as the fast one on boards with none of them", () => {
    const l = level(["r.#b", "....", "#..."], [{ color: "red", x: 1, y: 1, cap: 1 }, { color: "blue", x: 3, y: 2, cap: 1 }]);
    const a = solve(l, startState(l));
    const b = solveByRules(l, startState(l), 400_000, Infinity);
    expect(b).toMatchObject({ status: a.status, explored: a.explored });
  });
});

describe("boards still being built", () => {
  it("can have one end of a burrow, or a skittish mark without its chicken, unchecked", () => {
    const half = parseLevel({ id: "d", name: "d", rows: ["(..", "r.."], hatches: [{ color: "red", x: 1, y: 0, cap: 1 }], par: 1, skittish: [[2, 1]] }, 0, "", false);
    expect(half.burrow).toBeNull();
    expect(() => parseLevel({ id: "d", name: "d", rows: ["(..", "r.."], hatches: [{ color: "red", x: 1, y: 0, cap: 1 }], par: 1 }, 0)).toThrow();
  });
});
