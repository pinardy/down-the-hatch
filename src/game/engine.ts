// Rules. Every function is pure: state in, new state out.
//
//  - Drag a hatch and it slides one square at a time, up, down, left or right.
//  - A hatch can slide onto empty floor, or under chickens of its own colour, which drop in.
//  - Hay bales, other hatches and chickens of any other colour are in the way.
//  - A hatch holds a fixed number of chickens. When it is full it shuts and leaves the board.
//  - A frozen hatch cannot move until enough chickens have dropped to thaw it.
//  - A padlocked hatch cannot move until some hatch has slid over the key.
//  - An egg is a chicken whose colour you cannot see yet. It follows the same rules.
//  - Clear every chicken to win.

import { DELTA } from "./types";
import type { Chicken, Color, Dir, GameState, Hatch, Level, LevelDef, StepResult } from "./types";

const CHICKEN_CHARS: Record<string, Color> = { r: "red", y: "gold", t: "teal", b: "blue", p: "plum" };

export function parseLevel(def: LevelDef, index: number, chapter = ""): Level {
  const h = def.rows.length;
  const w = def.rows[0].length;
  const bales: boolean[] = new Array(w * h).fill(false);
  const chickens: Chicken[] = [];
  let key: Level["key"] = null;
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${def.name}: row ${y} is ${row.length} wide, expected ${w}`);
    [...row].forEach((ch, x) => {
      const color = CHICKEN_CHARS[ch.toLowerCase()];
      if (ch === "#") bales[y * w + x] = true;
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
  const level: Level = { index, id: def.id, name: def.name, chapter, w, h, bales, key, chickens, hatches, par: def.par, tip: def.tip };
  validate(level);
  return level;
}

function validate(level: Level) {
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
  for (const color of new Set([...level.chickens.map((c) => c.color), ...level.hatches.map((t) => t.color)])) {
    const birds = level.chickens.filter((c) => c.color === color).length;
    const room = level.hatches.filter((t) => t.color === color).reduce((n, t) => n + t.left, 0);
    if (birds !== room) fail(`${birds} ${color} chickens but room for ${room}`);
  }
}

export function startState(level: Level): GameState {
  return { hatches: level.hatches, chickens: level.chickens, keyTaken: level.key === null, moves: 0, lastHatch: null };
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

/** Slide one hatch one square. Returns null when something is in the way. */
export function step(level: Level, state: GameState, hatchId: number, dir: Dir): StepResult | null {
  const hatch = state.hatches.find((t) => t.id === hatchId);
  if (!hatch || heldBy(level, state, hatch)) return null;
  const sideways = dir === "left" || dir === "right";
  if (hatch.axis === "h" && !sideways) return null;
  if (hatch.axis === "v" && sideways) return null;

  const { dx, dy } = DELTA[dir];
  const dropped: Chicken[] = [];
  let tookKey = false;
  for (const [cx, cy] of hatch.cells) {
    // Only the squares the hatch would newly cover matter.
    if (hatch.cells.some(([ox, oy]) => ox === cx + dx && oy === cy + dy)) continue;
    const x = hatch.x + cx + dx;
    const y = hatch.y + cy + dy;
    if (x < 0 || y < 0 || x >= level.w || y >= level.h) return null;
    if (level.bales[y * level.w + x]) return null;
    for (const other of state.hatches) {
      if (other.id !== hatchId && other.cells.some(([ox, oy]) => other.x + ox === x && other.y + oy === y)) return null;
    }
    const bird = state.chickens.find((c) => c.x === x && c.y === y);
    if (bird) {
      if (bird.color !== hatch.color) return null;
      dropped.push(bird);
    }
    if (!state.keyTaken && level.key && level.key.x === x && level.key.y === y) tookKey = true;
  }
  if (dropped.length > hatch.left) return null;

  const moved: Hatch = { ...hatch, x: hatch.x + dx, y: hatch.y + dy, left: hatch.left - dropped.length };
  const full = moved.left === 0;
  return {
    state: {
      hatches: full ? state.hatches.filter((t) => t.id !== hatchId) : state.hatches.map((t) => (t.id === hatchId ? moved : t)),
      chickens: dropped.length ? state.chickens.filter((c) => !dropped.includes(c)) : state.chickens,
      keyTaken: state.keyTaken || tookKey,
      moves: state.lastHatch === hatchId ? state.moves : state.moves + 1,
      lastHatch: hatchId,
    },
    dropped,
    shut: full ? moved : null,
    tookKey,
  };
}

/** Eggs earned for a finished level: 3 at par, 2 within two moves of it, otherwise 1. */
export function eggsFor(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves <= par + 2) return 2;
  return 1;
}
