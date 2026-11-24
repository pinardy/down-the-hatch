// The best solution of every numbered level, worked out ahead of time (`npm run solutions`
// writes them to solutions.ts). With these, the first hint and "Watch the best solution"
// need no search at all, which matters most on phones short of memory, where the search
// is smaller and can give up on the biggest boards. A player still on the best path gets
// hints from it too, however they got there.

import { startState, step } from "./engine";
import type { SolveResult, SolveStep } from "./solver";
import type { Dir, GameState, Level } from "./types";
import { SOLUTIONS } from "./solutions";

const LETTER: Record<Dir, string> = { up: "u", down: "d", left: "l", right: "r" };
const DIR: Record<string, Dir> = { u: "up", d: "down", l: "left", r: "right" };

/**
 * Steps written compactly: a hatch's id (one digit), then the way each square it slides,
 * until the next id. "0dr1l" is hatch 0 down then right, then hatch 1 left.
 */
export function encodeSteps(steps: readonly SolveStep[]): string {
  let out = "";
  let last = -1;
  for (const s of steps) {
    if (s.hatch < 0 || s.hatch > 9) throw new Error(`hatch ${s.hatch} needs more than one digit`);
    if (s.hatch !== last) out += String(s.hatch);
    out += LETTER[s.dir];
    last = s.hatch;
  }
  return out;
}

export function decodeSteps(code: string): SolveStep[] | null {
  const steps: SolveStep[] = [];
  let hatch = -1;
  for (const ch of code) {
    if (ch >= "0" && ch <= "9") hatch = Number(ch);
    else if (DIR[ch] && hatch >= 0) steps.push({ hatch, dir: DIR[ch] });
    else return null;
  }
  return steps;
}

/** What a position is, leaving out how many moves it took to get there. */
export function boardKey(state: GameState): string {
  return JSON.stringify([
    state.hatches.map((t) => [t.id, t.x, t.y, t.left, t.color, t.cells.join(" ")]),
    state.chickens.map((c) => [c.id, c.hidden ? 1 : 0, c.x, c.y]),
    state.broken,
    state.keyTaken,
    [...state.crates].sort((a, b) => a - b),
  ]);
}

/**
 * Every position along the level's stored best solution, each with the rest of the way from
 * there, as a solver answer. Null for a level with no stored solution (the daily coop, shared
 * and endless coops) or one that no longer plays through, say after the board was changed.
 */
export function knownWay(level: Level): Map<string, SolveResult> | null {
  const code = SOLUTIONS[level.id];
  const steps = code === undefined ? null : decodeSteps(code);
  if (!steps) return null;
  const states: GameState[] = [startState(level)];
  for (const s of steps) {
    const out = step(level, states[states.length - 1], s.hatch, s.dir);
    if (!out) return null;
    states.push(out.state);
  }
  const end = states[states.length - 1];
  if (end.chickens.length) return null;
  const way = new Map<string, SolveResult>();
  states.forEach((state, i) => {
    const rest = steps.slice(i);
    const moves = rest.filter((s, j) => j === 0 || rest[j - 1].hatch !== s.hatch).length;
    const key = boardKey(state);
    if (!way.has(key)) way.set(key, { status: "solved", moves, steps: rest, explored: 0 });
  });
  return way;
}
