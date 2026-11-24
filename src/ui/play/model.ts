// What the play screen knows that isn't React: its phases and timings, and the pure helpers
// that read a board (which eggs crack, what a saved attempt restores to, why a slide is refused).

import { cellsOf, isWon, startState, step } from "../../game/engine";
import type { Blocker } from "../../game/engine";
import { DIRS } from "../../game/types";
import type { Dir, GameState, Hatch, Level } from "../../game/types";
import { PAINT } from "../art";
import { searchLimit } from "../solving";
import type { InPlay } from "../storage";

/** `replay` is the best solution playing itself out; `shown` is the sheet that follows it. */
export type Phase = "playing" | "won" | "timeup" | "replay" | "shown";

/**
 * An egg cracks open when a hatch slides up beside it. Returns `seen` itself if this hatch,
 * having just moved, is beside nothing new.
 */
export function peek(game: GameState, moved: Hatch, seen: ReadonlySet<number>): ReadonlySet<number> {
  const squares = cellsOf(moved);
  const fresh = game.chickens.filter((c) => c.hidden && !seen.has(c.id) && squares.some((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) === 1));
  return fresh.length ? new Set([...seen, ...fresh.map((c) => c.id)]) : seen;
}

/**
 * The hatch under the finger. Its place in the rules is always a whole square, but it is drawn
 * `offset` squares further along its `track`, so it glides with the finger between squares.
 */
export interface Held {
  id: number;
  track: "x" | "y" | null;
  offset: number;
  /**
   * How far off its line the finger was when the hatch took that line, less whatever it has
   * come back since (see easeSlack). Only going further across than this counts towards turning.
   */
  slack: number;
  /** The hatch slipped on, turned or went down the burrow mid-drag: the rest of the drag is ignored. */
  done?: boolean;
}

/**
 * This close to sitting squarely on a square, a hatch turns to face even a way that is shut,
 * so that pushing on says what is in the way. Further off, it turns only into an open way.
 */
export const TURN = 0.15;
/** How much further across than along the finger must be before the hatch turns: stops it dithering on a diagonal. */
export const TURN_MARGIN = 0.12;

/**
 * Whether a hatch `along` squares from its own square (either way) may turn a corner, given
 * whether the new way is open. It used to turn only when squarely on a square, so a sharp turn
 * made anywhere else was ignored until the finger wandered back.
 */
export const turnsAt = (along: number, open: boolean) => open || Math.abs(along) < TURN;

/**
 * The slack left once the finger is `off` its line: it only ever shrinks, as the finger comes
 * back towards the line, and is gone once the finger crosses it. So what counts towards a turn
 * (`off` less the slack) always points the way the finger is from the line, and the hatch never
 * turns a corner by moving against the finger.
 */
export const easeSlack = (slack: number, off: number) => (slack * off <= 0 ? 0 : Math.abs(off) < Math.abs(slack) ? off : slack);
/**
 * How far towards the next square the finger must be before the hatch counts as having moved
 * there: strictly past it while dragging (see stepsAt), at least it when the finger lifts.
 */
export const COMMIT = 0.5;
/** The same, when moving there drops chickens: they fall once the hatch is nearly under them. */
export const COMMIT_DROP = 0.85;

/**
 * While dragging, whether a finger `d` squares from the hatch's square (either way) moves it on
 * a square. Strictly past the threshold: a hatch that stepped at exactly halfway would be left
 * exactly halfway back, step straight back again, and break any cracked board it had crossed.
 */
export const stepsAt = (d: number, drops: boolean) => Math.abs(d) > (drops ? COMMIT_DROP : COMMIT);

/** How many positions a hint may search, and the quiet check after each move that the level can still be won. */
export const HINT_SEARCH = searchLimit(300_000);
export const STUCK_SEARCH = searchLimit(250_000);
/** Rewind settles for the latest position proved winnable once this long has passed (the worker keeps the board responsive meanwhile). */
export const REWIND_DEADLINE_MS = 4_000;
/** A search shorter than this shows no "Thinking": the answer just appears. */
export const THINK_AFTER_MS = 180;
export const STUCK_NOTE = "There’s no way to clear the coop from here. Rewind goes back to the last position that could still be won.";

/** The best solution, played back: the pause after each square, and the longer one before a different hatch moves. */
export const REPLAY_STEP_MS = 170;
export const REPLAY_TURN_MS = 430;

export const DROP_MS = 460;
export const SHUT_MS = 380;

/** Seconds allowed when racing the clock: generous, and longer for longer puzzles. */
export const allowance = (level: Level) => 30 + level.par * 8;

/** The gap between one egg landing on the win sheet and the next. */
export const EGG_LAND_MS = 260;

export const dirIndex = (d: Dir) => DIRS.indexOf(d);

/** A board left part-way through, replayed through the rules. Null if there is none, or it no longer fits the level. */
export function restore(level: Level, saved: InPlay | null): { game: GameState; history: GameState[]; saved: InPlay } | null {
  if (!saved || !saved.log.length) return null;
  const states = [startState(level)];
  for (const [id, d] of saved.log) {
    const out = step(level, states[states.length - 1], id, DIRS[d]);
    if (!out) return null;
    states.push(out.state);
  }
  const game = states[states.length - 1];
  if (isWon(game)) return null;
  if (saved.marks.some((m, i) => m > saved.log.length || (i > 0 && m < saved.marks[i - 1]))) return null;
  return { game, history: saved.marks.map((m) => states[m]), saved };
}

/** What to tell the player when a slide is refused, for the refusals that teach a rule. */
export function whyBlocked(level: Level, game: GameState, why: Blocker): string | null {
  const hatch = (id: number) => game.hatches.find((t) => t.id === id);
  switch (why.kind) {
    case "chicken": {
      const t = hatch(why.hatch);
      const bird = game.chickens.find((c) => c.id === why.id);
      if (!t || !bird) return null;
      const mine = PAINT[t.color].name;
      return `A ${mine} hatch only takes ${mine} chickens. That ${PAINT[bird.color].name} one is in the way.`;
    }
    case "full": {
      const t = hatch(why.hatch);
      return t ? `That hatch only has room for ${t.left} more. It can’t take them all at once.` : null;
    }
    case "ice": {
      const t = hatch(why.hatch);
      if (!t) return null;
      const n = Math.max(0, (t.ice ?? 0) - (level.chickens.length - game.chickens.length));
      return `Frozen until ${n} more ${n === 1 ? "chicken drops" : "chickens drop"}, anywhere on the board.`;
    }
    case "lock":
      return "Padlocked until a hatch slides over the key.";
    case "rail": {
      const t = hatch(why.hatch);
      return t ? `That hatch is on rails. It only slides ${t.axis === "h" ? "sideways" : "up and down"}.` : null;
    }
    case "hole":
      return "That board has given way. Nothing can cross it now.";
    case "arrow":
      return `That square is one-way: a hatch can only slide onto it moving ${why.dir === "up" ? "up" : why.dir === "down" ? "down" : `to the ${why.dir}`}.`;
    case "gate":
      return "The gate is shut. It opens while a hatch stands on a pressure plate.";
    case "crate":
      return "That crate can’t go any further: a crate only slides onto bare floor, and one at a time.";
    case "turn":
      return "No room to turn there. A hatch on a turntable swings a quarter turn clockwise, and needs bare floor to do it.";
    case "burrow":
      return why.why === "big" ? "Only a one-square hatch fits down a burrow." : "Something is sitting on the other end of the burrow.";
    default:
      return null;
  }
}
