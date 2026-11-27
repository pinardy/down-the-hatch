// Breadth-first solver. It finds the fewest moves that clear a level, where a move is one
// unbroken run of sliding the same hatch (the same thing the game counts).
//
// It is used three ways: the test suite proves every level is solvable and checks its par,
// `npm run levels` searches for new levels, and the game asks it for hints and to notice
// when a position can no longer be won.

import { COLORS, DELTA, DIRS } from "./types";
import type { Dir, GameState, Level } from "./types";
import { moverOf, startState, step } from "./engine";

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
  color: number[] | null; // each hatch's colour (index into COLORS), only when the board has paint
  broken: number; // cracked boards that have given way, one bit each
  last: number; // hatch moved last (for a chained pair, the lower id), -1 for none
  parent: Node | null;
  via: number; // hatch * 4 + dir index
  k: string; // its key (see keyOf), worked out once
}

const BITS = 30;
/** What an explored node's board becomes, and what takes its place in the frontier. */
const NO_BOARD: number[] = [];
const DONE: Node = { pos: NO_BOARD, left: [], alive: [], birds: 1, key: false, color: null, broken: 0, last: -1, parent: null, via: -1, k: "" };

/**
 * Does the level use a piece the fast search doesn't model: slippery floor, crates,
 * turntables, a burrow or skittish chickens? Those levels are searched by the game's own rules.
 */
export const needsRules = (level: Level) =>
  level.slick.some(Boolean) ||
  level.turns.some(Boolean) ||
  level.burrow !== null ||
  level.crates.length > 0 ||
  level.chickens.some((c) => c.skittish || c.order || c.under) ||
  level.levers.some(Boolean) ||
  level.fenceRight.some(Boolean) ||
  level.fenceDown.some(Boolean) ||
  level.hatches.some((t) => t.mirror !== undefined || t.uses !== undefined) ||
  level.mud.some(Boolean) ||
  level.bridges.some(Boolean) ||
  level.belts.some(Boolean) ||
  level.fox >= 0 ||
  level.chickens.some((c) => c.curious || c.alt);

export function solve(level: Level, from: GameState = startState(level), maxStates = 400_000, until = Infinity): SolveResult {
  if (needsRules(level)) return solveByRules(level, from, maxStates, until);
  const { w, h, bales } = level;
  const n = level.hatches.length;
  const shape = level.hatches; // sizes, colours and rails never change
  const birdAt = new Int16Array(w * h).fill(-1);
  for (const c of level.chickens) birdAt[c.y * w + c.x] = c.id;
  const birdColor = level.chickens.map((c) => c.color);
  const flock = level.chickens.length;
  const keyAt = level.key ? level.key.y * w + level.key.x : -1;
  // Paint (colour index, -1 for none), one-way squares (direction index, -1 for none), gates and plates.
  const paintAt = Int8Array.from(level.paint, (c) => (c ? COLORS.indexOf(c) : -1));
  const hasPaint = paintAt.some((c) => c >= 0);
  const arrowAt = Int8Array.from(level.arrows, (a) => (a ? DIRS.indexOf(a) : -1));
  const gateAt = Uint8Array.from(level.gates, (g) => (g ? 1 : 0));
  const plates = level.plates.flatMap((p, k) => (p ? [k] : []));
  // Cracked boards, numbered so that which have given way fits in one integer.
  const crackAt = new Int8Array(w * h).fill(-1);
  let cracks = 0;
  level.cracks.forEach((cracked, k) => cracked && (crackAt[k] = cracks++));
  // Chained pairs: each hatch's partner (-1 for none), and the id its moves are counted under.
  const partner = shape.map((t) => t.link ?? -1);
  const mover = shape.map((t) => (t.link === undefined ? t.id : Math.min(t.id, t.link)));
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
    color: hasPaint ? shape.map((t) => COLORS.indexOf(t.color)) : null,
    broken: from.broken.reduce((bits, k) => bits | (1 << crackAt[k]), 0),
    last: from.lastHatch ?? -1,
    parent: null,
    via: -1,
    k: "",
  };
  for (const t of from.hatches) {
    start.pos[t.id] = t.y * w + t.x;
    start.left[t.id] = t.left;
    if (start.color) start.color[t.id] = COLORS.indexOf(t.color);
  }
  for (const c of from.chickens) start.alive[(c.id / BITS) | 0] |= 1 << (c.id % BITS);

  const keyOf = (node: Node) => {
    let s = String.fromCharCode(node.last + 1 + (node.key ? 64 : 0));
    for (let i = 0; i < n; i++) s += String.fromCharCode(node.left[i] ? node.pos[i] + 1 : 0, node.left[i]);
    for (const bits of node.alive) s += String.fromCharCode(bits & 0x7fff, bits >>> 15);
    if (cracks) s += String.fromCharCode(node.broken & 0x7fff, node.broken >>> 15);
    if (node.color) for (let i = 0; i < n; i++) s += String.fromCharCode(node.left[i] ? node.color[i] : 0);
    return s;
  };

  /** Does hatch `j`, with its corner at `at`, cover this square? */
  const coversFrom = (at: number, j: number, cx: number, cy: number) => {
    const ox = cx - (at % w);
    const oy = cy - ((at / w) | 0);
    return ox >= 0 && oy >= 0 && ox < shape[j].w && oy < shape[j].h && covers[j][oy * shape[j].w + ox];
  };
  /** Does hatch `j`, where it stands in `node`, cover this square? */
  const coversAt = (node: Node, j: number, cx: number, cy: number) => coversFrom(node.pos[j], j, cx, cy);
  /** Is some hatch still on the board standing on a plate? */
  const pressed = (pos: number[], left: number[]) => {
    for (const k of plates) for (let b = 0; b < n; b++) if (left[b] && coversFrom(pos[b], b, k % w, (k / w) | 0)) return true;
    return false;
  };

  /**
   * Slide hatch `i` one square, and its chained partner with it, or return null if either is
   * blocked. Mirrors engine.step. A chained pair is only ever moved by its lower id, so the
   * search does not try the same slide twice.
   */
  const slide = (node: Node, i: number, d: number): Node | null => {
    const j = partner[i] >= 0 && node.left[partner[i]] ? partner[i] : -1;
    if (j >= 0 && j < i) return null;
    const sideways = d >= 2;
    const { dx, dy } = DELTA[DIRS[d]];

    let alive: number[] | null = null;
    let left: number[] | null = null;
    let key = node.key;
    let birds = node.birds;
    let color: number[] | null = null;
    let intoGate = false;
    for (let m = 0; m < (j >= 0 ? 2 : 1); m++) {
      const a = m ? j : i;
      const other = m ? i : j; // the partner, or -1
      const t = shape[a];
      if (t.ice && flock - node.birds < t.ice) return null;
      if (t.locked && !node.key) return null;
      if (t.axis === "h" && !sideways) return null;
      if (t.axis === "v" && sideways) return null;
      const x0 = node.pos[a] % w;
      const y0 = (node.pos[a] / w) | 0;
      const mine = node.color ? COLORS[node.color[a]] : t.color;
      let fresh = -1; // the last paint newly covered

      let eaten = 0;
      for (const [ex, ey] of edges[a][d]) {
        const cx = x0 + ex;
        const cy = y0 + ey;
        if (cx < 0 || cy < 0 || cx >= w || cy >= h) return null;
        const k = cy * w + cx;
        if (bales[k]) return null;
        if (crackAt[k] >= 0 && node.broken & (1 << crackAt[k])) return null;
        if (arrowAt[k] >= 0 && arrowAt[k] !== d) return null;
        if (gateAt[k]) intoGate = true;
        if (paintAt[k] >= 0) fresh = paintAt[k];
        // A square the partner is sliding out of is free.
        if (other >= 0 && coversAt(node, other, cx, cy)) continue;
        for (let b = 0; b < n; b++) {
          if (b === a || b === other || !node.left[b]) continue;
          if (coversAt(node, b, cx, cy)) return null;
        }
        const bird = birdAt[k];
        if (bird >= 0 && (alive ?? node.alive)[(bird / BITS) | 0] & (1 << (bird % BITS))) {
          if (birdColor[bird] !== mine && birdColor[bird] !== "any") return null;
          alive ??= node.alive.slice();
          alive[(bird / BITS) | 0] &= ~(1 << (bird % BITS));
          eaten++;
        }
        if (k === keyAt) key = true;
      }
      if (eaten > node.left[a]) return null;
      if (eaten) {
        left ??= node.left.slice();
        left[a] -= eaten;
        birds -= eaten;
      }
      if (fresh >= 0 && node.color && fresh !== node.color[a]) {
        color ??= node.color.slice();
        color[a] = fresh;
      }
    }

    const pos = node.pos.slice();
    pos[i] += dy * w + dx;
    if (j >= 0) pos[j] += dy * w + dx;
    if (intoGate && !pressed(pos, left ?? node.left)) return null;
    // A cracked board gives way once nothing of the pair is standing on it any more.
    let broken = node.broken;
    if (cracks) {
      for (let m = 0; m < (j >= 0 ? 2 : 1); m++) {
        const a = m ? j : i;
        const x0 = node.pos[a] % w;
        const y0 = (node.pos[a] / w) | 0;
        for (const [cx, cy] of shape[a].cells) {
          const c = crackAt[(y0 + cy) * w + x0 + cx];
          if (c < 0) continue;
          // Still covered if a hatch of the pair stood one square back from here before the slide.
          const held = coversAt(node, i, x0 + cx - dx, y0 + cy - dy) || (j >= 0 && coversAt(node, j, x0 + cx - dx, y0 + cy - dy));
          if (!held) broken |= 1 << c;
        }
      }
    }
    return { pos, left: left ?? node.left, alive: alive ?? node.alive, birds, key, color: color ?? node.color, broken, last: mover[i], parent: node, via: i * 4 + d, k: "" };
  };

  // One map for every position seen: the fewest moves found to reach it so far, or, once it has
  // been explored, -1 - those moves. (One map, not a map and a set, halves what is stored.)
  const best = new Map<string, number>();
  let explored = 0;
  start.k = keyOf(start);
  let frontier: Node[] = [start];
  let cost = 0;
  best.set(start.k, 0);

  while (frontier.length) {
    const next: Node[] = [];
    // The frontier grows while we walk it: continuing with the same hatch is free.
    for (let f = 0; f < frontier.length; f++) {
      const node = frontier[f];
      const seen = best.get(node.k)!;
      if (seen < 0) {
        frontier[f] = DONE; // explored already, at no more moves than now
        continue;
      }
      best.set(node.k, -1 - cost);
      explored++;
      if (node.birds === 0) {
        const steps: SolveStep[] = [];
        for (let at: Node | null = node; at && at.parent; at = at.parent) steps.push({ hatch: at.via >> 2, dir: DIRS[at.via & 3] });
        return { status: "solved", moves: cost, steps: steps.reverse(), explored };
      }
      if (explored > maxStates) return { status: "unknown", explored };
      // Past the deadline (ms since 1970), give up as if out of room. Checked now and then: the clock isn't free.
      if ((explored & 2047) === 0 && Date.now() > until) return { status: "unknown", explored };
      for (let i = 0; i < n; i++) {
        if (!node.left[i]) continue;
        for (let d = 0; d < 4; d++) {
          const child = slide(node, i, d);
          if (!child) continue;
          const childCost = mover[i] === node.last ? cost : cost + 1;
          child.k = keyOf(child);
          const known = best.get(child.k);
          // Explored (negative) means reached at no more moves than now: the search goes cheapest first.
          if (known !== undefined && (known < 0 || known <= childCost)) continue;
          best.set(child.k, childCost);
          (childCost === cost ? frontier : next).push(child);
        }
      }
      // Explored: from here on it is only kept to trace the way back, which needs `parent` and
      // `via` alone. Let its board go (the children have their own copies of what changed).
      node.pos = NO_BOARD;
      frontier[f] = DONE;
    }
    frontier = next;
    cost++;
  }
  return { status: "stuck", explored };
}

interface RulesNode {
  state: GameState | null; // let go once explored
  parent: RulesNode | null;
  via: number; // hatch * 4 + dir index
  k: string;
}

/**
 * The same search as `solve`, but each slide is made by the game's own `step`: slower, and it
 * can't disagree with the game. For the pieces that move things around or reshape a hatch.
 */
export function solveByRules(level: Level, from: GameState, maxStates: number, until: number): SolveResult {
  const w = level.w;
  const turning = level.turns.some(Boolean);
  // Chickens that can end up somewhere else, or another colour: then where and what each is matters.
  const roam = level.belts.some(Boolean) || level.chickens.some((c) => c.skittish || c.curious || c.alt);
  const keyOf = (s: GameState) => {
    let k = String.fromCharCode((s.lastHatch ?? -1) + 1 + (s.keyTaken ? 64 : 0) + (s.flipped ? 128 : 0));
    for (const t of s.hatches) {
      k += String.fromCharCode(t.id + 1, t.y * w + t.x + 1, t.left, COLORS.indexOf(t.color) + 1, (t.uses ?? 99) + 1);
      if (turning) for (const [cx, cy] of t.cells) k += String.fromCharCode(97 + cx * 8 + cy);
    }
    k += "|";
    for (const c of s.chickens) k += roam ? String.fromCharCode(c.id + 1, c.y * w + c.x + 1, c.color.charCodeAt(0)) : String.fromCharCode(c.id + 1);
    k += String.fromCharCode(s.fox + 2, (s.bogged ?? -1) + 2);
    k += "|";
    for (const b of s.broken) k += String.fromCharCode(b + 1);
    k += "|";
    // Crates are all alike: where they are matters, not which is which.
    for (const c of [...s.crates].sort((a, b) => a - b)) k += String.fromCharCode(c + 1);
    return k;
  };
  const start: RulesNode = { state: from, parent: null, via: -1, k: keyOf(from) };
  const best = new Map<string, number>([[start.k, 0]]);
  let explored = 0;
  let frontier: RulesNode[] = [start];
  for (let cost = 0; frontier.length; cost++) {
    const next: RulesNode[] = [];
    for (let f = 0; f < frontier.length; f++) {
      const node = frontier[f];
      if (best.get(node.k)! < 0) continue;
      best.set(node.k, -1 - cost);
      explored++;
      const s = node.state!;
      if (s.chickens.length === 0) {
        const steps: SolveStep[] = [];
        for (let at: RulesNode | null = node; at && at.parent; at = at.parent) steps.push({ hatch: at.via >> 2, dir: DIRS[at.via & 3] });
        return { status: "solved", moves: cost, steps: steps.reverse(), explored };
      }
      if (explored > maxStates) return { status: "unknown", explored };
      if ((explored & 511) === 0 && Date.now() > until) return { status: "unknown", explored };
      for (const t of s.hatches) {
        // A chained pair is moved by its lower id only.
        if (t.link !== undefined && t.link < t.id && s.hatches.some((o) => o.id === t.link)) continue;
        const mover = moverOf(t);
        for (let d = 0; d < 4; d++) {
          const out = step(level, s, t.id, DIRS[d]);
          if (!out) continue;
          const childCost = mover === s.lastHatch ? cost : cost + 1;
          const k = keyOf(out.state);
          const known = best.get(k);
          if (known !== undefined && (known < 0 || known <= childCost)) continue;
          best.set(k, childCost);
          (childCost === cost ? frontier : next).push({ state: out.state, parent: node, via: t.id * 4 + d, k });
        }
      }
      node.state = null;
    }
    frontier = next;
  }
  return { status: "stuck", explored };
}

/**
 * Given the positions a game has passed through, oldest first, find the last one that can
 * still be won. `known` gives answers already found for some of them (true winnable, false
 * lost), and `deadlineMs` bounds the time spent. A position that cannot be won never leads to one that can, so the winnable
 * positions are all at the front and a binary search finds where they end.
 *
 * Returns 0 (the first position) when nothing later is known to be winnable. A position the
 * solver gives up on counts as not winnable: it is better to go back a little too far than
 * to land somewhere that is still stuck.
 */
export function lastWinnable(level: Level, states: GameState[], maxStates = 300_000, known: readonly (boolean | null)[] = [], deadlineMs = Infinity): number {
  // What is already known narrows the search: the latest position known to be winnable, and
  // the first known lost after it.
  let good = 0;
  known.forEach((winnable, i) => winnable === true && i < states.length && (good = Math.max(good, i)));
  let bad = states.length;
  for (let i = good + 1; i < states.length; i++) {
    if (known[i] === false) {
      bad = i;
      break;
    }
  }
  // Out of time, settle for the latest position proved winnable so far: perhaps further back
  // than need be, but never somewhere that is already lost.
  const until = Date.now() + deadlineMs;
  const winnable = (i: number) => solve(level, states[i], maxStates, until).status === "solved";
  // The answer is usually a few moves back, where searches are small: look 1, 2, 4, 8... back
  // from the first lost position until one is winnable...
  for (let back = 1; bad - back > good && Date.now() < until; back *= 2) {
    if (winnable(bad - back)) {
      good = bad - back;
      break;
    }
    bad -= back;
  }
  // ...then narrow down between the two.
  while (bad - good > 1 && Date.now() < until) {
    const mid = (good + bad) >> 1;
    if (winnable(mid)) good = mid;
    else bad = mid;
  }
  return good;
}
