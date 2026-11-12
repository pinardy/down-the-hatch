import { describe, expect, it } from "vitest";
import { isWon, parseLevel, startState, step } from "./engine";
import { solve } from "./solver";
import { LEVELS } from "./levels";
import type { LevelDef } from "./types";

describe("rules", () => {
  const def: LevelDef = {
    name: "test",
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
    expect(a.shut).toBeNull();
    s = a.state;
    const b = step(level, s, 0, "right")!;
    expect(b.shut?.id).toBe(0);
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
    const level = parseLevel({ name: "L", rows: [".#..", "...r"], hatches: [{ color: "red", x: 0, y: 0, shape: ["x.", "xx"], cap: 1 }], par: 1 }, 0);
    const s = startState(level);
    expect(step(level, s, 0, "down")).toBeNull(); // off the board
    const a = step(level, s, 0, "right");
    expect(a).toBeNull(); // the upright would hit the bale
    expect(solve(level).status).toBe("stuck");
    const open = parseLevel({ name: "L2", rows: ["....", "...r"], hatches: [{ color: "red", x: 0, y: 0, shape: ["x.", "xx"], cap: 1 }], par: 1 }, 0);
    const r = solve(open);
    expect(r.status === "solved" && r.moves).toBe(1);
  });

  it("keeps a frozen hatch still until enough chickens have dropped", () => {
    const level = parseLevel(
      {
        name: "ice",
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
        name: "lock",
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
    const level = parseLevel({ name: "egg", rows: [".R"], hatches: [{ color: "red", x: 0, y: 0, cap: 1 }], par: 1 }, 0);
    expect(level.chickens[0]).toMatchObject({ color: "red", hidden: true });
    expect(step(level, startState(level), 0, "right")!.dropped).toHaveLength(1);
  });
});

describe("levels", () => {
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
