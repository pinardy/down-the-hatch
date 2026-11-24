import { describe, expect, it } from "vitest";
import { blockedBy, parseLevel, startState, step } from "../../game/engine";
import type { LevelDef } from "../../game/types";
import { allowance, COMMIT, COMMIT_DROP, easeSlack, peek, restore, stepsAt, TURN, turnsAt, whyBlocked } from "./model";

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

describe("when a drag moves a hatch on a square", () => {
  it("steps only strictly past the threshold", () => {
    expect(stepsAt(COMMIT, false)).toBe(false);
    expect(stepsAt(-COMMIT, false)).toBe(false);
    expect(stepsAt(COMMIT + 0.01, false)).toBe(true);
    expect(stepsAt(COMMIT_DROP, true)).toBe(false);
    expect(stepsAt(0.7, true)).toBe(false);
    expect(stepsAt(0.9, true)).toBe(true);
  });
  it("never steps straight back with what is left over after a step", () => {
    // The finger exactly halfway once stepped there and back, breaking a cracked board for a move.
    for (let d = -1.5; d <= 1.5; d += 1 / 64) {
      for (const drops of [false, true]) {
        if (!stepsAt(d, drops)) continue;
        const left = d - Math.sign(d);
        // Back the other way, whether or not that step would drop chickens.
        expect(Math.sign(left) !== -Math.sign(d) || !stepsAt(left, false), `d=${d}`).toBe(true);
      }
    }
  });
});

describe("when a dragged hatch turns a corner", () => {
  it("turns into an open way from anywhere between two squares", () => {
    expect(turnsAt(0, true)).toBe(true);
    expect(turnsAt(0.4, true)).toBe(true);
    expect(turnsAt(-0.5, true)).toBe(true);
  });
  it("faces a shut way only when squarely on a square, so that pushing on says what is in the way", () => {
    expect(turnsAt(TURN - 0.01, false)).toBe(true);
    expect(turnsAt(TURN, false)).toBe(false);
    expect(turnsAt(-0.4, false)).toBe(false);
  });
  it("forgives the finger being off the line, less and less as it comes back", () => {
    // Took the line with the finger 0.4 off it: staying there is not asking to turn.
    expect(easeSlack(0.4, 0.4)).toBe(0.4);
    expect(easeSlack(0.4, 0.6)).toBe(0.4);
    // Coming back towards the line uses the slack up; crossing the line ends it.
    expect(easeSlack(0.4, 0.25)).toBe(0.25);
    expect(easeSlack(0.25, 0.3)).toBe(0.25);
    expect(easeSlack(0.4, 0)).toBe(0);
    expect(easeSlack(0.4, -0.1)).toBe(0);
    expect(easeSlack(-0.3, -0.1)).toBe(-0.1);
    expect(easeSlack(0, 0.3)).toBe(0);
  });
  it("so what counts towards a turn never points against the finger", () => {
    for (let slack = -0.5; slack <= 0.5; slack += 0.125) {
      for (let off = -1; off <= 1; off += 0.125) {
        const counted = off - easeSlack(slack, off);
        expect(counted * off >= 0, `slack=${slack} off=${off}`).toBe(true);
        expect(Math.abs(counted) <= Math.abs(off)).toBe(true);
      }
    }
  });
});
