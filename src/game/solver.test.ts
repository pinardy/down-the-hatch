import { describe, expect, it } from "vitest";
import { blockedBy, eggsFor, isWon, parseLevel, startState, step, twoEggLimit } from "./engine";
import { lastWinnable, solve } from "./solver";
import { LEVELS } from "./levels";
import { DIRS } from "./types";
import type { GameState, Level, LevelDef } from "./types";

describe("rules", () => {
  const def: LevelDef = {
    id: "test", name: "test",
    rows: ["rrb", "..b", "#.."],
    hatches: [
      { color: "red", x: 0, y: 1, cap: 2 },
      { color: "blue", x: 2, y: 2, cap: 2 },
    ],
    par: 2,
  };
  const level = parseLevel(def, 0);

  it("drops matching chickens and shuts a full hatch", () => {
    let s = startState(level);
    const a = step(level, s, 0, "up")!;
    expect(a.dropped).toHaveLength(1);
    expect(a.shut).toEqual([]);
    s = a.state;
    const b = step(level, s, 0, "right")!;
    expect(b.shut.map((t) => t.id)).toEqual([0]);
    expect(b.state.hatches.map((t) => t.id)).toEqual([1]);
    expect(b.state.moves).toBe(1);
  });

  it("blocks on bales, walls, other colours and other hatches", () => {
    const s = startState(level);
    expect(step(level, s, 0, "down")).toBeNull(); // bale
    expect(step(level, s, 0, "left")).toBeNull(); // wall
    expect(step(level, s, 1, "right")).toBeNull(); // wall
    const s2 = step(level, step(level, s, 0, "right")!.state, 0, "right");
    expect(s2).toBeNull(); // blue chicken in the way of the red hatch
  });

  it("is solved in par by the solver", () => {
    const r = solve(level);
    expect(r.status).toBe("solved");
    if (r.status === "solved") expect(r.moves).toBe(2);
  });
});

describe("harder pieces", () => {
  it("slides an L-shaped hatch by its outline, not its box", () => {
    // The L covers (0,0), (0,1), (1,1). The bale sits in its notch at (1,0).
    const level = parseLevel({ id: "L", name: "L", rows: [".#..", "...r"], hatches: [{ color: "red", x: 0, y: 0, shape: ["x.", "xx"], cap: 1 }], par: 1 }, 0);
    const s = startState(level);
    expect(step(level, s, 0, "down")).toBeNull(); // off the board
    const a = step(level, s, 0, "right");
    expect(a).toBeNull(); // the upright would hit the bale
    expect(solve(level).status).toBe("stuck");
    const open = parseLevel({ id: "L2", name: "L2", rows: ["....", "...r"], hatches: [{ color: "red", x: 0, y: 0, shape: ["x.", "xx"], cap: 1 }], par: 1 }, 0);
    const r = solve(open);
    expect(r.status === "solved" && r.moves).toBe(1);
  });

  it("keeps a frozen hatch still until enough chickens have dropped", () => {
    const level = parseLevel(
      {
        id: "ice", name: "ice",
        rows: ["..r", "..b"],
        hatches: [
          { color: "red", x: 0, y: 0, cap: 1, ice: 1 },
          { color: "blue", x: 0, y: 1, cap: 1 },
        ],
        par: 2,
      },
      0,
    );
    let s = startState(level);
    expect(step(level, s, 0, "right")).toBeNull();
    s = step(level, step(level, s, 1, "right")!.state, 1, "right")!.state;
    expect(step(level, s, 0, "right")).not.toBeNull();
    const r = solve(level);
    expect(r.status === "solved" && r.moves).toBe(2);
  });

  it("keeps a padlocked hatch still until the key is picked up", () => {
    const level = parseLevel(
      {
        id: "lock", name: "lock",
        rows: ["..r", ".kb"],
        hatches: [
          { color: "red", x: 0, y: 0, cap: 1, locked: true },
          { color: "blue", x: 0, y: 1, cap: 1 },
        ],
        par: 2,
      },
      0,
    );
    const s = startState(level);
    expect(step(level, s, 0, "right")).toBeNull();
    const got = step(level, s, 1, "right")!;
    expect(got.tookKey).toBe(true);
    expect(step(level, got.state, 0, "right")).not.toBeNull();
    const r = solve(level);
    expect(r.status === "solved" && r.moves).toBe(2);
  });

  it("treats an egg as a chicken of its colour", () => {
    const level = parseLevel({ id: "egg", name: "egg", rows: [".R"], hatches: [{ color: "red", x: 0, y: 0, cap: 1 }], par: 1 }, 0);
    expect(level.chickens[0]).toMatchObject({ color: "red", hidden: true });
    expect(step(level, startState(level), 0, "right")!.dropped).toHaveLength(1);
  });
});

describe("white chickens", () => {
  const level = parseLevel(
    {
      id: "wild",
      name: "wild",
      rows: ["w.r", "..w"],
      hatches: [
        { color: "red", x: 1, y: 0, cap: 2 },
        { color: "blue", x: 0, y: 1, cap: 1 },
      ],
      par: 2,
    },
    0,
  );

  it("drop down a hatch of any colour, and take up room in it", () => {
    const s = startState(level);
    const red = step(level, s, 0, "left")!;
    expect(red.dropped.map((c) => c.color)).toEqual(["any"]);
    expect(red.state.hatches.find((t) => t.id === 0)!.left).toBe(1);
    const blue = step(level, step(level, s, 1, "right")!.state, 1, "right")!;
    expect(blue.dropped.map((c) => c.color)).toEqual(["any"]);
    expect(blue.shut.map((t) => t.id)).toEqual([1]);
  });

  it("let a level have fewer coloured chickens than room, but never more", () => {
    expect(() => parseLevel({ id: "x", name: "x", rows: ["rr.w"], hatches: [{ color: "red", x: 2, y: 0, cap: 2 }], par: 1 }, 0)).toThrow(/3 chickens but room for 2/);
    expect(() => parseLevel({ id: "x", name: "x", rows: ["rr."], hatches: [{ color: "red", x: 2, y: 0, cap: 1 }], par: 1 }, 0)).toThrow(/2 red chickens but room for 1/);
    expect(() => parseLevel({ id: "x", name: "x", rows: ["rw."], hatches: [{ color: "red", x: 2, y: 0, cap: 2 }], par: 1 }, 0)).not.toThrow();
  });
});

describe("cracked boards", () => {
  // The hatch must take the chicken on its left before it crosses the cracked board for the other.
  const level = parseLevel({ id: "crack", name: "crack", rows: ["r.~.r"], hatches: [{ color: "red", x: 1, y: 0, cap: 2 }], par: 1 }, 0);

  it("hold while a hatch is on them and give way when it slides off", () => {
    const on = step(level, startState(level), 0, "right")!;
    expect(on.broke).toEqual([]);
    expect(on.state.broken).toEqual([]);
    const off = step(level, on.state, 0, "right")!;
    expect(off.broke).toEqual([2]);
    expect(off.state.broken).toEqual([2]);
    expect(step(level, off.state, 0, "left")).toBeNull(); // nothing crosses a hole
  });

  it("make crossing too early a mistake the solver can see", () => {
    const crossed = step(level, step(level, startState(level), 0, "right")!.state, 0, "right")!.state;
    expect(solve(level, crossed).status).toBe("stuck");
    const r = solve(level);
    expect(r.status === "solved" && r.moves).toBe(1);
  });

  it("come back when a move is undone, because state is never changed in place", () => {
    const s = startState(level);
    step(level, step(level, s, 0, "right")!.state, 0, "right");
    expect(s.broken).toEqual([]);
  });
});

describe("paint, gates and one-way squares", () => {
  const level = (rows: string[], hatches: LevelDef["hatches"]) => parseLevel({ id: "t", name: "t", rows, hatches, par: 1 }, 0);

  it("paint gives a hatch its colour from then on", () => {
    const l = level([".4b"], [{ color: "red", x: 0, y: 0, cap: 1 }]);
    const s1 = step(l, startState(l), 0, "right")!;
    expect(s1.state.hatches[0].color).toBe("blue");
    expect(s1.painted.map((t) => t.id)).toEqual([0]);
    expect(step(l, s1.state, 0, "right")!.dropped.map((c) => c.color)).toEqual(["blue"]);
  });

  it("judges the chickens of the painting step by the old colour", () => {
    // The tall hatch reaches the paint and a red chicken on the same step: red still drops.
    const l = level(["..4", "..r"], [{ color: "red", x: 1, y: 0, h: 2, cap: 1 }]);
    const s1 = step(l, startState(l), 0, "right")!;
    expect(s1.dropped.map((c) => c.color)).toEqual(["red"]);
  });

  it("gates open only while a hatch stands on a plate", () => {
    const l = level(["o.b..", "...=r"], [{ color: "red", x: 0, y: 1, cap: 1 }, { color: "blue", x: 1, y: 0, cap: 1 }]);
    let s = startState(l);
    s = step(l, s, 0, "right")!.state;
    s = step(l, s, 0, "right")!.state;
    expect(step(l, s, 0, "right")).toBeNull();
    expect(blockedBy(l, s, 0, "right")).toEqual({ kind: "gate", x: 3, y: 1 });
    const press = step(l, s, 1, "left")!;
    expect(press.gate).toBe("opened");
    const through = step(l, press.state, 0, "right")!;
    expect(through.state.hatches.find((t) => t.id === 0)!.x).toBe(3);
    // Leaving the plate shuts the gate behind the red hatch, which may stay where it is.
    const off = step(l, through.state, 1, "right")!;
    expect(off.gate).toBe("closed");
    expect(step(l, off.state, 0, "right")!.dropped.map((c) => c.color)).toEqual(["red"]);
  });

  it("one-way squares can only be entered the way the arrow points", () => {
    const l = level([".>.r", "...."], [{ color: "red", x: 0, y: 0, cap: 1 }]);
    const s1 = step(l, startState(l), 0, "right")!;
    expect(s1).not.toBeNull();
    const back = step(l, step(l, s1.state, 0, "right")!.state, 0, "left");
    expect(back).toBeNull();
    expect(blockedBy(l, step(l, s1.state, 0, "right")!.state, 0, "left")).toEqual({ kind: "arrow", x: 1, y: 0, dir: "right" });
  });
});

describe("chained hatches", () => {
  const pair = (rows: string[]) =>
    parseLevel(
      {
        id: "chain",
        name: "chain",
        rows,
        hatches: [
          { color: "red", x: 0, y: 0, cap: 1, link: "a" },
          { color: "blue", x: 0, y: 1, cap: 1, link: "a" },
        ],
        par: 1,
      },
      0,
    );

  it("slide together, whichever one is dragged, and count as one move", () => {
    const level = pair(["...r", "...b"]);
    const a = step(level, startState(level), 1, "right")!;
    expect(a.moved.map((t) => [t.id, t.x])).toEqual([
      [1, 1],
      [0, 1],
    ]);
    const b = step(level, a.state, 0, "right")!;
    expect(b.state.moves).toBe(1);
    expect(b.state.lastHatch).toBe(0);
  });

  it("stop dead when either one is blocked", () => {
    const level = pair(["...r", "..#b"]);
    const a = step(level, startState(level), 0, "right")!;
    expect(step(level, a.state, 0, "right")).toBeNull(); // red has room, but blue would hit the bale
    expect(step(level, a.state, 1, "right")).toBeNull();
    expect(solve(level).status).toBe("stuck");
  });

  it("go free once one of the pair has shut", () => {
    const level = pair([".r..", "...b"]);
    const a = step(level, startState(level), 0, "right")!;
    expect(a.shut.map((t) => t.id)).toEqual([0]);
    expect(a.state.hatches.map((t) => t.id)).toEqual([1]);
    const s = step(level, step(level, a.state, 1, "right")!.state, 1, "right")!.state;
    expect(isWon(s)).toBe(true);
    expect(s.moves).toBe(1); // still the same pair's move
    const r = solve(level);
    expect(r.status === "solved" && r.moves).toBe(1);
  });

  it("can follow one another along a row", () => {
    const level = parseLevel(
      {
        id: "train",
        name: "train",
        rows: ["...b.r"],
        hatches: [
          { color: "red", x: 0, y: 0, cap: 1, link: "a" },
          { color: "blue", x: 1, y: 0, cap: 1, link: "a" },
        ],
        par: 1,
      },
      0,
    );
    // Red slides into the square blue is leaving; blue may not slide into red, which would have to leave the board.
    expect(step(level, startState(level), 0, "right")).not.toBeNull();
    expect(step(level, startState(level), 0, "left")).toBeNull();
  });

  it("must come in twos", () => {
    expect(() => parseLevel({ id: "x", name: "x", rows: ["..r"], hatches: [{ color: "red", x: 0, y: 0, cap: 1, link: "a" }], par: 1 }, 0)).toThrow(/exactly 2/);
  });
});

/** The fewest moves by brute force, using nothing but the engine. Small boards only. */
function referencePar(level: Level): number | null {
  const keyOf = (s: GameState) => JSON.stringify([s.hatches.map((t) => [t.id, t.x, t.y, t.left, t.color]), s.chickens.map((c) => c.id), s.broken, s.keyTaken, s.lastHatch]);
  const best = new Map<string, number>([[keyOf(startState(level)), 0]]);
  let frontier = [startState(level)];
  for (let cost = 0; frontier.length; cost++) {
    const next: GameState[] = [];
    for (let f = 0; f < frontier.length; f++) {
      const s = frontier[f];
      if (best.get(keyOf(s)) !== s.moves || s.moves !== cost) continue;
      if (isWon(s)) return cost;
      for (const t of s.hatches) {
        for (const dir of DIRS) {
          const out = step(level, s, t.id, dir)?.state;
          if (!out) continue;
          const k = keyOf(out);
          if ((best.get(k) ?? Infinity) <= out.moves) continue;
          best.set(k, out.moves);
          (out.moves === cost ? frontier : next).push(out);
        }
      }
    }
    frontier = next;
  }
  return null;
}

describe("the solver and the engine agree", () => {
  // Small boards that lean on every rule at once. The solver has its own fast copy of the
  // rules; this checks it against the engine's by solving each board the slow way too.
  const boards: Omit<LevelDef, "id" | "name" | "par">[] = [
    { rows: ["r.~.w", "..#..", "b~..y"], hatches: [{ color: "red", x: 1, y: 0, cap: 2 }, { color: "blue", x: 2, y: 2, cap: 1 }, { color: "gold", x: 3, y: 2, cap: 1 }] },
    { rows: ["..r.", "~~..", "b..w", "...."], hatches: [{ color: "red", x: 0, y: 0, cap: 1, link: "a" }, { color: "blue", x: 0, y: 3, cap: 2, link: "a" }] },
    { rows: ["..wr", "...y", "k~.b", "...."], hatches: [{ color: "red", x: 0, y: 0, w: 2, cap: 2, link: "z" }, { color: "blue", x: 0, y: 3, cap: 1, link: "z", locked: true }, { color: "gold", x: 3, y: 3, cap: 1 }] },
    { rows: ["W..~.", ".#.~.", "...yr", "~...."], hatches: [{ color: "gold", x: 4, y: 0, cap: 1, ice: 1 }, { color: "red", x: 0, y: 2, shape: ["x.", "xx"], cap: 1, link: "q" }, { color: "red", x: 3, y: 3, cap: 1, link: "q" }] },
    { rows: ["r~w~b", "..~..", "....."], hatches: [{ color: "red", x: 0, y: 2, cap: 2 }, { color: "blue", x: 4, y: 2, cap: 1, axis: "v" }] },
    // Paint, gates and one-way squares, on their own and together.
    { rows: ["r.4.b", ".....", "y.2.."], hatches: [{ color: "red", x: 0, y: 1, cap: 2 }, { color: "teal", x: 4, y: 1, cap: 1 }] },
    { rows: ["o..=r", ".#.#b", "....."], hatches: [{ color: "red", x: 0, y: 2, cap: 1 }, { color: "blue", x: 1, y: 0, cap: 1 }] },
    { rows: ["r.>.r", "..^..", "b...."], hatches: [{ color: "red", x: 0, y: 1, cap: 2 }, { color: "blue", x: 4, y: 2, cap: 1 }] },
    { rows: ["o=2r", ".v..", "y..<", "...."], hatches: [{ color: "red", x: 0, y: 3, cap: 1, link: "a" }, { color: "blue", x: 2, y: 3, cap: 1, link: "a" }] },
    { rows: ["b=..o", "1=.#.", "..v..", "r.<.."], hatches: [{ color: "blue", x: 2, y: 0, shape: ["xx", "x."], cap: 1 }, { color: "gold", x: 4, y: 2, h: 2, cap: 1 }] },
  ];
  it.each(boards.map((b, i) => [i + 1, b] as const))("board %i", (i, def) => {
    let level: Level;
    try {
      level = parseLevel({ ...def, id: `agree-${i}`, name: `agree ${i}`, par: 0 }, 0);
    } catch (e) {
      throw new Error(`board ${i} is not a valid level: ${String(e)}`);
    }
    const slow = referencePar(level);
    const fast = solve(level);
    expect(fast.status).toBe(slow === null ? "stuck" : "solved");
    if (fast.status === "solved") expect(fast.moves).toBe(slow);
  });
});

describe("eggs", () => {
  it("gives two eggs for two over par on short levels, and a quarter of par on long ones", () => {
    expect(eggsFor(5, 5)).toBe(3);
    expect(eggsFor(7, 5)).toBe(2);
    expect(eggsFor(8, 5)).toBe(1);
    expect(twoEggLimit(1)).toBe(3);
    expect(twoEggLimit(12)).toBe(15);
    expect(twoEggLimit(30)).toBe(38);
    expect(eggsFor(38, 30)).toBe(2);
    expect(eggsFor(39, 30)).toBe(1);
  });
});

describe("what blocks a move", () => {
  // Wander every level with a fixed sequence of tries: whenever the engine refuses a step,
  // blockedBy must name a reason, and whenever it allows one, blockedBy must find none.
  it("agrees with the engine on every level", () => {
    let seed = 7;
    const rand = (n: number) => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (const level of LEVELS) {
      let state = startState(level);
      for (let i = 0; i < 60 && state.hatches.length; i++) {
        const hatch = state.hatches[rand(state.hatches.length)];
        const dir = DIRS[rand(4)];
        const out = step(level, state, hatch.id, dir);
        const why = blockedBy(level, state, hatch.id, dir);
        if (out) expect(why).toBeNull();
        else expect(why, `${level.name}: hatch ${hatch.id} ${dir}`).not.toBeNull();
        if (out) state = out.state;
      }
    }
  });
});

describe("rewinding", () => {
  // Two red hatches. The first is on a rail and can only reach the chicken below it, so the
  // second must take the chicken on the right. If it takes the left one instead, the level is lost.
  const level = parseLevel(
    {
      id: "fork", name: "fork",
      rows: ["...", "r.r"],
      hatches: [
        { color: "red", x: 0, y: 0, cap: 1, axis: "v" },
        { color: "red", x: 1, y: 1, cap: 1 },
      ],
      par: 2,
    },
    0,
  );
  const s0 = startState(level);
  const up = step(level, s0, 1, "up")!.state;
  const lost = step(level, step(level, up, 1, "down")!.state, 1, "left")!.state;

  it("knows the wrong chicken loses the level", () => {
    expect(solve(level, up).status).toBe("solved");
    expect(solve(level, lost).status).toBe("stuck");
  });

  it("finds the last position that can still be won", () => {
    expect(lastWinnable(level, [s0, up, lost])).toBe(1);
    expect(lastWinnable(level, [s0, lost])).toBe(0);
    expect(lastWinnable(level, [s0, up])).toBe(1);
    expect(lastWinnable(level, [s0])).toBe(0);
  });

  it("starts from what is already known, and settles for a proved position when out of time", () => {
    // Known winnable at 1: no need to look before it.
    expect(lastWinnable(level, [s0, up, lost], 300_000, [null, true, null])).toBe(1);
    // Known lost at 2: no need to look at it.
    expect(lastWinnable(level, [s0, up, lost], 300_000, [null, null, false])).toBe(1);
    // No time at all: the start, which can always be won.
    expect(lastWinnable(level, [s0, up, lost], 300_000, [], 0)).toBe(0);
    // No time, but 1 is known: that.
    expect(lastWinnable(level, [s0, up, lost], 300_000, [null, true, null], 0)).toBe(1);
  });
});

describe("levels", () => {
  it("gives every level its own id", () => {
    const ids = LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9-]+$/);
  });

  it.each(LEVELS.map((l) => [l.index + 1, l.name, l] as const))("level %i (%s) is solvable at its par", (_n, _name, level) => {
    const r = solve(level, startState(level), 3_000_000);
    expect(r.status).toBe("solved");
    if (r.status !== "solved") return;
    expect(r.moves).toBe(level.par);
    // Replay the solver's answer through the real engine: the two must agree.
    let s = startState(level);
    for (const st of r.steps) {
      const out = step(level, s, st.hatch, st.dir);
      expect(out).not.toBeNull();
      s = out!.state;
    }
    expect(isWon(s)).toBe(true);
    expect(s.moves).toBe(level.par);
  });
});
