// Breadth-first solver. It finds the fewest moves that clear a level, where a move is one
// unbroken run of sliding the same hatch (the same thing the game counts).
//
// It is used three ways: the test suite proves every level is solvable and checks its par,
// `npm run levels` searches for new levels, and the game asks it for hints and to notice
// when a position can no longer be won.

import { DELTA, DIRS } from "./types";
import type { Dir, GameState, Level } from "./types";
import { startState } from "./engine";

export interface SolveStep {
  hatch: number;
  dir: Dir;
}

export type SolveResult =
  | { status: "solved"; moves: number; steps: SolveStep[]; explored: number }
  /** Every reachable position was tried and none clears the board. */
  | { status: "stuck"; explored: number }
  /** Gave up after `maxStates` positions. */
  | { status: "unknown"; explored: number };

interface Node {
  pos: number[]; // top-left square of each hatch, row-major
  left: number[]; // 0 = already shut
  alive: number[]; // chicken bitset, 30 bits per entry
  birds: number;
  key: boolean; // the key has been picked up
  last: number; // hatch moved last, -1 for none
  parent: Node | null;
  via: number; // hatch * 4 + dir index
}

const BITS = 30;

export function solve(level: Level, from: GameState = startState(level), maxStates = 400_000): SolveResult {
  const { w, h, bales } = level;
  const n = level.hatches.length;
  const shape = level.hatches; // sizes, colours and rails never change
  const birdAt = new Int16Array(w * h).fill(-1);
  for (const c of level.chickens) birdAt[c.y * w + c.x] = c.id;
  const birdColor = level.chickens.map((c) => c.color);
  const flock = level.chickens.length;
  const keyAt = level.key ? level.key.y * w + level.key.x : -1;
  // Per hatch: which squares of its box it covers, and for each direction the squares
  // (as offsets from its corner) it would newly cover by sliding one step that way.
  const covers = shape.map((t) => {
    const mask = new Array<boolean>(t.w * t.h).fill(false);
    for (const [cx, cy] of t.cells) mask[cy * t.w + cx] = true;
    return mask;
  });
  const edges = shape.map((t) =>
    DIRS.map((dir) => {
      const { dx, dy } = DELTA[dir];
      return t.cells.filter(([cx, cy]) => !t.cells.some(([ox, oy]) => ox === cx + dx && oy === cy + dy)).map(([cx, cy]) => [cx + dx, cy + dy] as const);
    }),
  );

  const start: Node = {
    pos: shape.map(() => 0),
    left: shape.map(() => 0),
    alive: new Array(Math.ceil(Math.max(1, level.chickens.length) / BITS)).fill(0),
    birds: from.chickens.length,
    key: from.keyTaken,
    last: from.lastHatch ?? -1,
    parent: null,
    via: -1,
  };
  for (const t of from.hatches) {
    start.pos[t.id] = t.y * w + t.x;
    start.left[t.id] = t.left;
  }
  for (const c of from.chickens) start.alive[(c.id / BITS) | 0] |= 1 << (c.id % BITS);

  const keyOf = (node: Node) => {
    let s = String.fromCharCode(node.last + 1 + (node.key ? 64 : 0));
    for (let i = 0; i < n; i++) s += String.fromCharCode(node.left[i] ? node.pos[i] + 1 : 0, node.left[i]);
    for (const bits of node.alive) s += String.fromCharCode(bits & 0x7fff, bits >>> 15);
    return s;
  };

  /** Slide hatch `i` one square, or return null if blocked. Mirrors engine.step. */
  const slide = (node: Node, i: number, d: number): Node | null => {
    const t = shape[i];
    if (t.ice && flock - node.birds < t.ice) return null;
    if (t.locked && !node.key) return null;
    const sideways = d >= 2;
    if (t.axis === "h" && !sideways) return null;
    if (t.axis === "v" && sideways) return null;
    const x0 = node.pos[i] % w;
    const y0 = (node.pos[i] / w) | 0;

    let eaten = 0;
    let alive: number[] | null = null;
    let key = node.key;
    for (const [ex, ey] of edges[i][d]) {
      const cx = x0 + ex;
      const cy = y0 + ey;
      if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;
      const k = cy * w + cx;
      if (bales[k]) return null;
      for (let j = 0; j < n; j++) {
        if (j === i || !node.left[j]) continue;
        const ox = cx - (node.pos[j] % w);
        const oy = cy - ((node.pos[j] / w) | 0);
        if (ox >= 0 && oy >= 0 && ox < shape[j].w && oy < shape[j].h && covers[j][oy * shape[j].w + ox]) return null;
      }
      const bird = birdAt[k];
      if (bird >= 0 && (alive ?? node.alive)[(bird / BITS) | 0] & (1 << (bird % BITS))) {
        if (birdColor[bird] !== t.color) return null;
        alive ??= node.alive.slice();
        alive[(bird / BITS) | 0] &= ~(1 << (bird % BITS));
        eaten++;
      }
      if (k === keyAt) key = true;
    }
    if (eaten > node.left[i]) return null;

    const { dx, dy } = DELTA[DIRS[d]];
    const pos = node.pos.slice();
    pos[i] = (y0 + dy) * w + x0 + dx;
    let left = node.left;
    if (eaten) {
      left = node.left.slice();
      left[i] -= eaten;
    }
    return { pos, left, alive: alive ?? node.alive, birds: node.birds - eaten, key, last: i, parent: node, via: i * 4 + d };
  };

  const done = new Set<string>();
  const best = new Map<string, number>();
  let frontier: Node[] = [start];
  let cost = 0;
  best.set(keyOf(start), 0);

  while (frontier.length) {
    const next: Node[] = [];
    // The frontier grows while we walk it: continuing with the same hatch is free.
    for (let f = 0; f < frontier.length; f++) {
      const node = frontier[f];
      const key = keyOf(node);
      if (done.has(key)) continue;
      done.add(key);
      if (node.birds === 0) {
        const steps: SolveStep[] = [];
        for (let at: Node | null = node; at && at.parent; at = at.parent) steps.push({ hatch: at.via >> 2, dir: DIRS[at.via & 3] });
        return { status: "solved", moves: cost, steps: steps.reverse(), explored: done.size };
      }
      if (done.size > maxStates) return { status: "unknown", explored: done.size };
      for (let i = 0; i < n; i++) {
        if (!node.left[i]) continue;
        for (let d = 0; d < 4; d++) {
          const child = slide(node, i, d);
          if (!child) continue;
          const childCost = i === node.last ? cost : cost + 1;
          const childKey = keyOf(child);
          const known = best.get(childKey);
          if (known !== undefined && known <= childCost) continue;
          best.set(childKey, childCost);
          (childCost === cost ? frontier : next).push(child);
        }
      }
    }
    frontier = next;
    cost++;
  }
  return { status: "stuck", explored: done.size };
}

/**
 * Given the positions a game has passed through, oldest first, find the last one that can
 * still be won. A position that cannot be won never leads to one that can, so the winnable
 * positions are all at the front and a binary search finds where they end.
 *
 * Returns 0 (the first position) when nothing later is known to be winnable. A position the
 * solver gives up on counts as not winnable: it is better to go back a little too far than
 * to land somewhere that is still stuck.
 */
export function lastWinnable(level: Level, states: GameState[], maxStates = 300_000): number {
  let good = 0;
  let bad = states.length;
  while (bad - good > 1) {
    const mid = (good + bad) >> 1;
    if (solve(level, states[mid], maxStates).status === "solved") good = mid;
    else bad = mid;
  }
  return good;
}
