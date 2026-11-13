// Rules. Every function is pure: state in, new state out.
//
//  - Drag a hatch and it slides one square at a time, up, down, left or right.
//  - A hatch can slide onto empty floor, or under chickens of its own colour, which drop in.
//  - Hay bales, other hatches and chickens of any other colour are in the way.
//  - A hatch holds a fixed number of chickens. When it is full it shuts and leaves the board.
//  - A frozen hatch cannot move until enough chickens have dropped to thaw it.
//  - A padlocked hatch cannot move until some hatch has slid over the key.
//  - An egg is a chicken whose colour you cannot see yet. It follows the same rules.
//  - A white chicken drops down any hatch, and takes up room in it like any other.
//  - A cracked board holds while a hatch is on it. When the hatch slides off, it gives way
//    and nothing can cross that square again.
//  - Two hatches chained together slide as one. If either is blocked, neither moves.
//  - Clear every chicken to win.

import { DELTA } from "./types";
import type { Chicken, Dir, Feather, GameState, Hatch, Level, LevelDef, StepResult } from "./types";

const CHICKEN_CHARS: Record<string, Feather> = { r: "red", y: "gold", t: "teal", b: "blue", p: "plum", w: "any" };

/**
 * Read a level as written in levels.ts. Throws if it is not a fair level (see validate), unless
 * `check` is false: the level editor draws boards that are still being built.
 */
export function parseLevel(def: LevelDef, index: number, chapter = "", check = true): Level {
  const h = def.rows.length;
  const w = def.rows[0].length;
  const bales: boolean[] = new Array(w * h).fill(false);
  const cracks: boolean[] = new Array(w * h).fill(false);
  const chickens: Chicken[] = [];
  let key: Level["key"] = null;
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${def.name}: row ${y} is ${row.length} wide, expected ${w}`);
    [...row].forEach((ch, x) => {
      const color = CHICKEN_CHARS[ch.toLowerCase()];
      if (ch === "#") bales[y * w + x] = true;
      else if (ch === "~") cracks[y * w + x] = true;
      else if (ch === "k") key = { x, y };
      else if (color) chickens.push({ id: chickens.length, color, x, y, ...(ch !== ch.toLowerCase() ? { hidden: true } : {}) });
      else if (ch !== ".") throw new Error(`${def.name}: unknown square "${ch}" at ${x},${y}`);
    });
  });
  const hatches: Hatch[] = def.hatches.map((d, id) => {
    const shape = d.shape ?? new Array<string>(d.h ?? 1).fill("x".repeat(d.w ?? 1));
    const cells: [number, number][] = [];
    shape.forEach((row, dy) => [...row].forEach((ch, dx) => ch === "x" && cells.push([dx, dy])));
    return {
      id,
      color: d.color,
      x: d.x,
      y: d.y,
      w: Math.max(...shape.map((r) => r.length)),
      h: shape.length,
      cells,
      left: d.cap,
      ...(d.axis ? { axis: d.axis } : {}),
      ...(d.ice ? { ice: d.ice } : {}),
      ...(d.locked ? { locked: true } : {}),
    };
  });
  // Chains: two hatches carrying the same tag.
  const tags = new Map<string, number[]>();
  def.hatches.forEach((d, id) => d.link !== undefined && tags.set(d.link, [...(tags.get(d.link) ?? []), id]));
  for (const [tag, ids] of tags) {
    if (ids.length !== 2) throw new Error(`${def.name}: chain "${tag}" joins ${ids.length} hatches, it must join exactly 2`);
    hatches[ids[0]].link = ids[1];
    hatches[ids[1]].link = ids[0];
  }
  const level: Level = { index, id: def.id, name: def.name, chapter, w, h, bales, cracks, key, chickens, hatches, par: def.par, tip: def.tip };
  if (check) validate(level);
  return level;
}

export function validate(level: Level) {
  const fail = (why: string) => {
    throw new Error(`${level.name}: ${why}`);
  };
  const taken = new Set<number>();
  for (const hatch of level.hatches) {
    if (!hatch.cells.length || hatch.left < 1) fail(`hatch ${hatch.id} is empty`);
    if (hatch.axis && hatch.cells.length !== hatch.w * hatch.h) fail(`hatch ${hatch.id}: only rectangles can be on rails`);
    if (hatch.locked && !level.key) fail(`hatch ${hatch.id} is padlocked but there is no key`);
    if (hatch.ice && hatch.ice > level.chickens.length - hatch.left) fail(`hatch ${hatch.id} can never thaw`);
    for (const cell of cellsOf(hatch)) {
      const inside = cell.x >= 0 && cell.y >= 0 && cell.x < level.w && cell.y < level.h;
      const k = cell.y * level.w + cell.x;
      const onKey = level.key?.x === cell.x && level.key.y === cell.y;
      if (!inside || level.bales[k] || taken.has(k) || onKey || level.chickens.some((c) => c.x === cell.x && c.y === cell.y)) {
        fail(`hatch ${hatch.id} does not sit on free floor`);
      }
      taken.add(k);
    }
  }
  // Every chicken needs a hatch to go down, and every hatch must be able to fill. A white
  // chicken can make up the numbers for any colour.
  for (const color of new Set([...level.chickens.map((c) => c.color), ...level.hatches.map((t) => t.color)])) {
    if (color === "any") continue;
    const birds = level.chickens.filter((c) => c.color === color).length;
    const room = level.hatches.filter((t) => t.color === color).reduce((n, t) => n + t.left, 0);
    if (birds > room) fail(`${birds} ${color} chickens but room for ${room}`);
  }
  const room = level.hatches.reduce((n, t) => n + t.left, 0);
  if (level.chickens.length !== room) fail(`${level.chickens.length} chickens but room for ${room}`);
  if (level.cracks.filter(Boolean).length > 30) fail("more than 30 cracked boards");
}

export function startState(level: Level): GameState {
  return { hatches: level.hatches, chickens: level.chickens, broken: [], keyTaken: level.key === null, moves: 0, lastHatch: null };
}

export function isWon(state: GameState): boolean {
  return state.chickens.length === 0;
}

/** The squares a hatch covers right now. */
export function cellsOf(hatch: Hatch): { x: number; y: number }[] {
  return hatch.cells.map(([dx, dy]) => ({ x: hatch.x + dx, y: hatch.y + dy }));
}

/** How many more chickens must drop before this hatch thaws (0 when it is not frozen). */
export function thawIn(level: Level, state: GameState, hatch: Hatch): number {
  return Math.max(0, (hatch.ice ?? 0) - (level.chickens.length - state.chickens.length));
}

/** Why a hatch cannot move at all right now, if it cannot. */
export function heldBy(level: Level, state: GameState, hatch: Hatch): "ice" | "lock" | null {
  if (thawIn(level, state, hatch) > 0) return "ice";
  if (hatch.locked && !state.keyTaken) return "lock";
  return null;
}

/** What a move by this hatch is counted under: its own id, or for a chained pair the lower of the two. */
export const moverOf = (hatch: Hatch) => (hatch.link === undefined ? hatch.id : Math.min(hatch.id, hatch.link));

/** The hatch this one is chained to, while both are still on the board. */
export function partnerOf(state: GameState, hatch: Hatch): Hatch | undefined {
  return hatch.link === undefined ? undefined : state.hatches.find((t) => t.id === hatch.link);
}

/**
 * Slide one hatch one square, and with it the hatch it is chained to, if any.
 * Returns null when something is in the way of either.
 */
export function step(level: Level, state: GameState, hatchId: number, dir: Dir): StepResult | null {
  const hatch = state.hatches.find((t) => t.id === hatchId);
  if (!hatch) return null;
  const partner = partnerOf(state, hatch);
  const group = partner ? [hatch, partner] : [hatch];
  const sideways = dir === "left" || dir === "right";
  for (const t of group) {
    if (heldBy(level, state, t)) return null;
    if (t.axis === "h" && !sideways) return null;
    if (t.axis === "v" && sideways) return null;
  }

  const { dx, dy } = DELTA[dir];
  const covers = (t: Hatch, x: number, y: number) => t.cells.some(([ox, oy]) => t.x + ox === x && t.y + oy === y);
  const dropped: Chicken[] = [];
  const eaten = new Map<number, number>();
  let tookKey = false;
  for (const t of group) {
    let mine = 0;
    for (const [cx, cy] of t.cells) {
      const x = t.x + cx + dx;
      const y = t.y + cy + dy;
      // Only the squares the hatch would newly cover matter...
      if (covers(t, x, y)) continue;
      if (x < 0 || y < 0 || x >= level.w || y >= level.h) return null;
      const k = y * level.w + x;
      if (level.bales[k] || state.broken.includes(k)) return null;
      // ...and a square its chained partner is sliding out of is free.
      if (group.some((g) => g !== t && covers(g, x, y))) continue;
      if (state.hatches.some((other) => !group.includes(other) && covers(other, x, y))) return null;
      const bird = state.chickens.find((c) => c.x === x && c.y === y);
      if (bird) {
        if (bird.color !== t.color && bird.color !== "any") return null;
        dropped.push(bird);
        mine++;
      }
      if (!state.keyTaken && level.key && level.key.x === x && level.key.y === y) tookKey = true;
    }
    if (mine > t.left) return null;
    eaten.set(t.id, mine);
  }

  const moved = group.map((t): Hatch => ({ ...t, x: t.x + dx, y: t.y + dy, left: t.left - eaten.get(t.id)! }));
  const shut = moved.filter((t) => t.left === 0);
  // A cracked board gives way once nothing is standing on it any more.
  const broke: number[] = [];
  for (const t of group) {
    for (const cell of cellsOf(t)) {
      const k = cell.y * level.w + cell.x;
      if (level.cracks[k] && !broke.includes(k) && !moved.some((m) => covers(m, cell.x, cell.y))) broke.push(k);
    }
  }
  const mover = moverOf(hatch);
  return {
    state: {
      hatches: state.hatches.flatMap((t) => {
        const now = moved.find((m) => m.id === t.id);
        return now ? (now.left === 0 ? [] : [now]) : [t];
      }),
      chickens: dropped.length ? state.chickens.filter((c) => !dropped.includes(c)) : state.chickens,
      broken: broke.length ? [...state.broken, ...broke].sort((a, b) => a - b) : state.broken,
      keyTaken: state.keyTaken || tookKey,
      moves: state.lastHatch === mover ? state.moves : state.moves + 1,
      lastHatch: mover,
    },
    dropped,
    moved,
    shut,
    broke,
    tookKey,
  };
}

/** Eggs earned for a finished level: 3 at par, 2 within two moves of it, otherwise 1. */
export function eggsFor(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves <= par + 2) return 2;
  return 1;
}
