import { describe, expect, it } from "vitest";
import { blockedBy, parseLevel, startState, step } from "../../game/engine";
import type { LevelDef } from "../../game/types";
import { allowance, peek, restore, whyBlocked } from "./model";

const level = (rows: string[], hatches: LevelDef["hatches"]) => parseLevel({ id: "t", name: "t", rows, hatches, par: 1 }, 0);

describe("restoring a saved attempt", () => {
  const l = level([".brr", "#..."], [{ color: "red", x: 0, y: 0, cap: 2 }, { color: "blue", x: 3, y: 1, cap: 1 }]);
  const saved = (log: [number, number][], marks: number[]) => ({ log, marks, seen: [], hinted: false, at: 0 });

  it("replays the slides and rebuilds the undo history", () => {
    // blue: left, left (one move, two undo points when nudged)
    const got = restore(l, saved([[1, 2], [1, 2]], [0, 1]))!;
    expect(got.game.hatches.find((t) => t.id === 1)!.x).toBe(1);
    expect(got.game.moves).toBe(1);
    expect(got.history.map((s) => s.hatches.find((t) => t.id === 1)!.x)).toEqual([3, 2]);
  });
  it("refuses a log the rules no longer allow, an empty one, or one that already won", () => {
    expect(restore(l, null)).toBeNull();
    expect(restore(l, saved([], []))).toBeNull();
    expect(restore(l, saved([[0, 3]], [0]))).toBeNull(); // red can't slide right into the blue chicken
    expect(restore(l, saved([[1, 2]], [5]))).toBeNull(); // an undo point past the end
    const won = restore(l, saved([[1, 2], [1, 2], [1, 0], [0, 3], [0, 3], [0, 3]], [0, 3]));
    expect(won).toBeNull();
  });
});

describe("saying why a slide is refused", () => {
  it("names the colours for a wrong chicken, and the count for ice", () => {
    const l = level([".br", "..."], [{ color: "red", x: 0, y: 0, cap: 1 }, { color: "blue", x: 0, y: 1, cap: 1, ice: 1 }]);
    const s = startState(l);
    expect(whyBlocked(l, s, blockedBy(l, s, 0, "right")!)).toBe("A red hatch only takes red chickens. That blue one is in the way.");
    expect(whyBlocked(l, s, blockedBy(l, s, 1, "right")!)).toBe("Frozen until 1 more chicken drops, anywhere on the board.");
  });
  it("says nothing for walls and hay", () => {
    const l = level(["#.r"], [{ color: "red", x: 1, y: 0, cap: 1 }]);
    const s = startState(l);
    expect(whyBlocked(l, s, blockedBy(l, s, 0, "left")!)).toBeNull();
    expect(whyBlocked(l, s, blockedBy(l, s, 0, "up")!)).toBeNull();
  });
});

describe("eggs and the clock", () => {
  it("cracks an egg when a hatch stops beside it, not before", () => {
    const l = level(["..R"], [{ color: "red", x: 0, y: 0, cap: 1 }]);
    const none = new Set<number>();
    expect(peek(startState(l), startState(l).hatches[0], none)).toBe(none);
    const next = step(l, startState(l), 0, "right")!;
    expect([...peek(next.state, next.moved[0], none)]).toEqual([0]);
  });
  it("allows longer for longer puzzles", () => {
    expect(allowance({ par: 1 } as never)).toBe(38);
    expect(allowance({ par: 30 } as never)).toBe(270);
  });
});
