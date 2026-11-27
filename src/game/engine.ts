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
//  - A hatch that slides onto paint takes the paint's colour from then on. The chickens it
//    drops on that same step are judged by the colour it had before.
//  - Gate squares can only be entered while some hatch stands on a pressure plate (counting
//    where every hatch is after the step). A hatch already in a gate may stay there.
//  - A one-way square can only be entered by a hatch moving the way its arrow points.
//  - A hatch on slippery floor can't stop: after each square it slides another the same way,
//    for as long as it is still on slippery floor and nothing stops it. It is all one move.
//  - A hatch shoves a crate in its way one square on, if there is plain empty floor beyond it.
//    One crate at a time: a crate behind a crate stops it.
//  - A hatch that slides onto a turntable turns a quarter, clockwise, about that square, if
//    there is room for it to (bare floor, nothing on it). Otherwise it can't go on. A hatch on
//    rails, or chained, or of one square, isn't turned.
//  - A one-square hatch that slides into a burrow comes out of the other end, if that is clear.
//    Bigger hatches, and chained ones, don't fit.
//  - A skittish chicken right beside a hatch that has just slid hops one square the same way,
//    if there is room (and stays put if not). Corner it to catch it.
//  - Two mirrored hatches slide opposite ways: when one goes left, the other goes right. If
//    either is blocked, neither moves. They count as one move.
//  - A move that slides onto a lever flips every door: shut ones open, open ones shut. A shut
//    door can't be entered; a hatch already in the doorway may stay.
//  - A tired hatch can only be picked up for so many moves. Going on with it is the same move.
//  - Chickens in the pecking order must be taken in turn: number 1 first, then 2, and so on.
//  - A fence on the edge between two squares stops anything crossing it.
//  - A chicken can sit on top of another. A hatch takes the top one; the one underneath waits
//    for a hatch to slide onto the square again.
//  - Clear every chicken to win.

import { COLORS, DELTA } from "./types";
import type { Chicken, Color, Dir, Feather, GameState, Hatch, Level, LevelDef, StepResult } from "./types";

const CHICKEN_CHARS: Record<string, Feather> = { r: "red", y: "gold", t: "teal", b: "blue", p: "plum", w: "any" };
/** Paint puddles: `1` to `5`, in the order of COLORS. */
export const PAINT_CHARS: Record<string, Color> = Object.fromEntries(COLORS.map((c, i) => [String(i + 1), c]));
export const ARROW_CHARS: Record<string, Dir> = { "<": "left", ">": "right", "^": "up", v: "down" };

/**
 * Read a level as written in levels.ts. Throws if it is not a fair level (see validate), unless
 * `check` is false: the level editor draws boards that are still being built.
 */
export function parseLevel(def: LevelDef, index: number, chapter = "", check = true): Level {
  const h = def.rows.length;
  const w = def.rows[0].length;
  const bales: boolean[] = new Array(w * h).fill(false);
  const cracks: boolean[] = new Array(w * h).fill(false);
  const paint: (Color | null)[] = new Array(w * h).fill(null);
  const plates: boolean[] = new Array(w * h).fill(false);
  const gates: boolean[] = new Array(w * h).fill(false);
  const arrows: (Dir | null)[] = new Array(w * h).fill(null);
  const slick: boolean[] = new Array(w * h).fill(false);
  const turns: boolean[] = new Array(w * h).fill(false);
  const crates: number[] = [];
  const ends: { "(": number[]; ")": number[] } = { "(": [], ")": [] };
  const levers: boolean[] = new Array(w * h).fill(false);
  const doors: (boolean | null)[] = new Array(w * h).fill(null);
  const fenceRight: boolean[] = new Array(w * h).fill(false);
  const fenceDown: boolean[] = new Array(w * h).fill(false);
  const chickens: Chicken[] = [];
  let key: Level["key"] = null;
  def.rows.forEach((row, y) => {
    if (row.length !== w) throw new Error(`${def.name}: row ${y} is ${row.length} wide, expected ${w}`);
    [...row].forEach((ch, x) => {
      const color = CHICKEN_CHARS[ch.toLowerCase()];
      if (ch === "#") bales[y * w + x] = true;
      else if (ch === "~") cracks[y * w + x] = true;
      else if (ch === "k") key = { x, y };
      else if (PAINT_CHARS[ch]) paint[y * w + x] = PAINT_CHARS[ch];
      else if (ch === "o") plates[y * w + x] = true;
      else if (ch === "=") gates[y * w + x] = true;
      else if (ARROW_CHARS[ch]) arrows[y * w + x] = ARROW_CHARS[ch];
      else if (ch === "_") slick[y * w + x] = true;
      else if (ch === "*") turns[y * w + x] = true;
      else if (ch === "@") crates.push(y * w + x);
      else if (ch === "(" || ch === ")") ends[ch].push(y * w + x);
      else if (ch === "%") levers[y * w + x] = true;
      else if (ch === "+" || ch === "-") doors[y * w + x] = ch === "+";
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
      ...(d.uses !== undefined ? { uses: d.uses } : {}),
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
  // Mirrors: the same, with a mirror tag.
  const mirrors = new Map<string, number[]>();
  def.hatches.forEach((d, id) => d.mirror !== undefined && mirrors.set(d.mirror, [...(mirrors.get(d.mirror) ?? []), id]));
  for (const [tag, ids] of mirrors) {
    if (ids.length !== 2) {
      if (check) throw new Error(`${def.name}: mirror "${tag}" pairs ${ids.length} hatches, it must pair exactly 2`);
      continue;
    }
    if (hatches[ids[0]].link !== undefined || hatches[ids[1]].link !== undefined) throw new Error(`${def.name}: a hatch can't be chained and mirrored`);
    hatches[ids[0]].mirror = ids[1];
    hatches[ids[1]].mirror = ids[0];
  }
  // A second chicken under the one on its square.
  for (const [x, y, ch] of def.under ?? []) {
    const color = CHICKEN_CHARS[ch];
    const top = chickens.find((c) => c.x === x && c.y === y && !c.under);
    if (!color || !top || chickens.some((c) => c.x === x && c.y === y && c.under)) {
      if (check) throw new Error(`${def.name}: no room for a chicken under ${x},${y}`);
      continue;
    }
    chickens.push({ id: chickens.length, color, x, y, under: true });
  }
  (def.order ?? []).forEach(([x, y], i) => {
    const bird = chickens.find((c) => c.x === x && c.y === y && !c.under);
    if (bird && !bird.order) bird.order = i + 1;
    else if (check) throw new Error(`${def.name}: no chicken at ${x},${y} for the pecking order`);
  });
  for (const [x, y, side] of def.fences ?? []) {
    if (x < 0 || y < 0 || x >= w || y >= h) {
      if (check) throw new Error(`${def.name}: a fence off the board at ${x},${y}`);
      continue;
    }
    (side === "right" ? fenceRight : fenceDown)[y * w + x] = true;
  }
  // A board still being built (`check` false) may have a burrow with one end so far: it has no burrow yet.
  for (const [x, y] of def.skittish ?? []) {
    const bird = chickens.find((c) => c.x === x && c.y === y);
    if (bird) bird.skittish = true;
    else if (check) throw new Error(`${def.name}: no chicken at ${x},${y} to be skittish`);
  }
  const paired = ends["("].length === 1 && ends[")"].length === 1;
  if (check && !paired && ends["("].length + ends[")"].length > 0) throw new Error(`${def.name}: a burrow needs one ( and one )`);
  const burrow: Level["burrow"] = paired ? [ends["("][0], ends[")"][0]] : null;
  const level: Level = { index, id: def.id, name: def.name, chapter, w, h, bales, cracks, key, paint, plates, gates, arrows, slick, turns, burrow, crates, levers, doors, fenceRight, fenceDown, chickens, hatches, par: def.par, tip: def.tip, ...(def.demo ? { demo: true } : {}) };
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
    if (hatch.uses !== undefined && (!Number.isInteger(hatch.uses) || hatch.uses < 1)) fail(`hatch ${hatch.id} is too tired to move at all`);
    for (const cell of cellsOf(hatch)) {
      const inside = cell.x >= 0 && cell.y >= 0 && cell.x < level.w && cell.y < level.h;
      const k = cell.y * level.w + cell.x;
      const onKey = level.key?.x === cell.x && level.key.y === cell.y;
      if (!inside || level.bales[k] || taken.has(k) || onKey || level.crates.includes(k) || level.burrow?.includes(k) || level.chickens.some((c) => c.x === cell.x && c.y === cell.y)) {
        fail(`hatch ${hatch.id} does not sit on free floor`);
      }
      taken.add(k);
    }
  }
  if (level.gates.some(Boolean) !== level.plates.some(Boolean)) fail("gates need a pressure plate, and a plate needs a gate");
  if (level.doors.some((d) => d !== null) !== level.levers.some(Boolean)) fail("doors need a lever, and a lever needs a door");
  // Every chicken needs a hatch to go down, and every hatch must be able to fill. A white
  // chicken can make up the numbers for any colour. Paint can change a hatch's colour, so
  // with paint on the board only the totals have to agree.
  const painted = level.paint.some(Boolean);
  for (const color of new Set([...level.chickens.map((c) => c.color), ...level.hatches.map((t) => t.color)])) {
    if (painted) break;
    if (color === "any") continue;
    const birds = level.chickens.filter((c) => c.color === color).length;
    const room = level.hatches.filter((t) => t.color === color).reduce((n, t) => n + t.left, 0);
    if (birds > room) fail(`${birds} ${color} chickens but room for ${room}`);
  }
  const room = level.hatches.reduce((n, t) => n + t.left, 0);
  if (level.chickens.length !== room) fail(`${level.chickens.length} chickens but room for ${room}`);
  if (level.cracks.filter(Boolean).length > 30) fail("more than 30 cracked boards");
  if (level.burrow && level.chickens.some((c) => level.burrow!.includes(c.y * level.w + c.x))) fail("a chicken in a burrow");
}

export function startState(level: Level): GameState {
  return { hatches: level.hatches, chickens: level.chickens, broken: [], crates: level.crates, flipped: false, keyTaken: level.key === null, moves: 0, lastHatch: null };
}

/** Is the door on this square shut now? False where there is no door. */
export const doorShut = (level: Level, flipped: boolean, k: number) => level.doors[k] !== null && level.doors[k] !== flipped;

/** Is there a fence in the way of going from this square one square `dir`? */
export function fenced(level: Level, x: number, y: number, dir: Dir): boolean {
  const k = y * level.w + x;
  if (dir === "right") return level.fenceRight[k];
  if (dir === "left") return x > 0 && level.fenceRight[k - 1];
  if (dir === "down") return level.fenceDown[k];
  return y > 0 && level.fenceDown[k - level.w];
}

/** The chicken on a square that a hatch would take: the top one, or the one left underneath once it has gone. */
export const chickenAt = (chickens: readonly Chicken[], x: number, y: number) => chickens.find((c) => c.x === x && c.y === y && !c.under) ?? chickens.find((c) => c.x === x && c.y === y);

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

/** Is some hatch standing on a pressure plate? Then the gates are open. */
export function gatesOpen(level: Level, hatches: readonly Hatch[]): boolean {
  return hatches.some((t) => t.cells.some(([cx, cy]) => level.plates[(t.y + cy) * level.w + t.x + cx]));
}

/** What a move by this hatch is counted under: its own id, or for a chained or mirrored pair the lower of the two. */
export const moverOf = (hatch: Hatch) => {
  const other = hatch.link ?? hatch.mirror;
  return other === undefined ? hatch.id : Math.min(hatch.id, other);
};

/** The hatch this one is mirrored with, while both are still on the board. */
export function mirrorOf(state: GameState, hatch: Hatch): Hatch | undefined {
  return hatch.mirror === undefined ? undefined : state.hatches.find((t) => t.id === hatch.mirror);
}

const OPPOSITE: Record<Dir, Dir> = { up: "down", down: "up", left: "right", right: "left" };

/** The hatch this one is chained to, while both are still on the board. */
export function partnerOf(state: GameState, hatch: Hatch): Hatch | undefined {
  return hatch.link === undefined ? undefined : state.hatches.find((t) => t.id === hatch.link);
}

/**
 * Slide one hatch one square, and with it the hatch it is chained to, if any; on slippery
 * floor, on until it stops. Returns null when something is in the way of either.
 */
export function step(level: Level, state: GameState, hatchId: number, dir: Dir): StepResult | null {
  const first = attempt(level, state, hatchId, dir);
  if (!first || "no" in first) return null;
  let out = first.ok;
  if (!level.slick.some(Boolean)) return out;
  const onSlick = (t: Hatch) => t.cells.some(([cx, cy]) => level.slick[(t.y + cy) * level.w + t.x + cx]);
  // Each further square is another step of the same move, for as long as it is on slippery
  // floor; a turn or a trip down the burrow ends it, and so does a hatch shutting.
  for (let guard = level.w * level.h; guard > 0; guard--) {
    if (out.turned.length || out.burrowed || out.shut.length || !out.moved.some(onSlick)) break;
    const next = attempt(level, out.state, hatchId, dir);
    if (!next || "no" in next) break;
    const n = next.ok;
    out = {
      state: n.state,
      dropped: [...out.dropped, ...n.dropped],
      moved: n.moved,
      shut: n.shut,
      broke: [...out.broke, ...n.broke],
      tookKey: out.tookKey || n.tookKey,
      painted: [...out.painted.filter((p) => !n.moved.some((m) => m.id === p.id)), ...n.painted],
      gate: null,
      pushed: [...out.pushed, ...n.pushed],
      turned: n.turned,
      burrowed: n.burrowed,
      slid: out.slid + 1,
      hopped: [...out.hopped.filter((c) => !n.hopped.some((m) => m.id === c.id)), ...n.hopped],
      flipped: n.state.flipped !== state.flipped,
    };
  }
  if (out.slid) {
    const was = gatesOpen(level, state.hatches);
    const now = gatesOpen(level, out.state.hatches);
    out.gate = was === now ? null : now ? "opened" : "closed";
    out.hopped = out.hopped.filter((c) => out.state.chickens.some((b) => b.id === c.id));
    out.painted = out.painted.filter((p) => out.state.hatches.some((t) => t.id === p.id));
  }
  return out;
}

/**
 * The most moves that still earn two eggs. Two over par on a short level; on a long one the
 * margin grows with it (a quarter of par), so a 30-move coop isn't held to the same two moves.
 */
export const twoEggLimit = (par: number) => par + Math.max(2, Math.round(par / 4));

/** Eggs earned for a finished level: 3 at par, 2 within the margin above (see twoEggLimit), otherwise 1. */
export function eggsFor(moves: number, par: number): 1 | 2 | 3 {
  if (moves <= par) return 3;
  if (moves <= twoEggLimit(par)) return 2;
  return 1;
}

/** Why a hatch cannot take one step in a direction. Used to show the player what is in the way. */
export type Blocker =
  | { kind: "edge" }
  | { kind: "bale"; x: number; y: number }
  | { kind: "hole"; x: number; y: number }
  | { kind: "hatch"; id: number }
  | { kind: "chicken"; id: number; hatch: number }
  | { kind: "full"; hatch: number }
  | { kind: "ice"; hatch: number }
  | { kind: "lock"; hatch: number }
  | { kind: "rail"; hatch: number }
  | { kind: "arrow"; x: number; y: number; dir: Dir }
  | { kind: "gate"; x: number; y: number }
  /** A crate that has nowhere to go. */
  | { kind: "crate"; x: number; y: number }
  /** No room to turn on this turntable. */
  | { kind: "turn"; x: number; y: number }
  /** The hatch is too big for the burrow, or its other end is blocked. */
  | { kind: "burrow"; x: number; y: number; why: "big" | "exit" }
  /** A tired hatch with no moves left in it. */
  | { kind: "tired"; hatch: number }
  /** A shut door. */
  | { kind: "door"; x: number; y: number }
  /** A fence on the edge of this square, the way the hatch is going. */
  | { kind: "fence"; x: number; y: number; dir: Dir }
  /** A chicken that can't be taken yet: number `need` comes first. */
  | { kind: "order"; id: number; hatch: number; need: number };

/** What stops this step, or null if nothing does. The same rules as `step`, saying which piece is in the way. */
export function blockedBy(level: Level, state: GameState, hatchId: number, dir: Dir): Blocker | null {
  const a = attempt(level, state, hatchId, dir);
  return a && "no" in a ? a.no : null;
}

/**
 * Plain floor with nothing on it, as things stand: where a crate can be shoved, a skittish
 * chicken can hop, or a turning hatch can swing. With `floorOnly`, special squares don't count
 * as plain either. A shut door never does.
 */
function bare(level: Level, state: { hatches: readonly Hatch[]; chickens: readonly Chicken[]; crates: readonly number[]; keyTaken: boolean; flipped: boolean }, x: number, y: number, floorOnly: boolean): boolean {
  if (x < 0 || y < 0 || x >= level.w || y >= level.h) return false;
  const k = y * level.w + x;
  if (level.bales[k] || level.burrow?.includes(k) || state.crates.includes(k) || doorShut(level, state.flipped, k)) return false;
  if (!state.keyTaken && level.key?.x === x && level.key.y === y) return false;
  if (floorOnly && (level.cracks[k] || level.paint[k] || level.plates[k] || level.gates[k] || level.arrows[k] || level.slick[k] || level.turns[k] || level.levers[k] || level.doors[k] !== null)) return false;
  if (state.chickens.some((c) => c.x === x && c.y === y)) return false;
  return !state.hatches.some((t) => t.cells.some(([cx, cy]) => t.x + cx === x && t.y + cy === y));
}

/**
 * One square: the result, or what stops it. Null when there is no such hatch. Both `step` and
 * `blockedBy` are this, so the game never refuses a slide for one reason and names another.
 */
function attempt(level: Level, state: GameState, hatchId: number, dir: Dir): { ok: StepResult } | { no: Blocker } | null {
  const hatch = state.hatches.find((t) => t.id === hatchId);
  if (!hatch) return null;
  const partner = partnerOf(state, hatch);
  const mirror = mirrorOf(state, hatch);
  const group = [hatch, ...(partner ? [partner] : []), ...(mirror ? [mirror] : [])];
  // Each hatch of the move goes its own way: a mirrored one the opposite way.
  const wayOf = (t: Hatch): Dir => (t === mirror ? OPPOSITE[dir] : dir);
  const mover = moverOf(hatch);
  const fresh = state.lastHatch !== mover; // picked up for a new move
  for (const t of group) {
    const held = heldBy(level, state, t);
    if (held) return { no: { kind: held, hatch: t.id } };
  }
  for (const t of group) {
    const sideways = wayOf(t) === "left" || wayOf(t) === "right";
    if ((t.axis === "h" && !sideways) || (t.axis === "v" && sideways)) return { no: { kind: "rail", hatch: t.id } };
  }
  if (fresh) for (const t of group) if (t.uses === 0) return { no: { kind: "tired", hatch: t.id } };

  const w = level.w;
  const covers = (t: Hatch, x: number, y: number) => t.cells.some(([ox, oy]) => t.x + ox === x && t.y + oy === y);
  const dropped: Chicken[] = [];
  const eaten = new Map<number, number>();
  const pushed: StepResult["pushed"] = [];
  let tookKey = false;
  let gate: { x: number; y: number } | null = null;
  let burrow = -1; // the end of the burrow the hatch goes into
  let flips = 0;
  for (const t of group) {
    const way = wayOf(t);
    const { dx, dy } = DELTA[way];
    // Every square of the hatch moves, so a fence anywhere under or beside it can stop it.
    for (const [cx, cy] of t.cells) {
      if (fenced(level, t.x + cx, t.y + cy, way)) return { no: { kind: "fence", x: t.x + cx, y: t.y + cy, dir: way } };
    }
    let mine = 0;
    for (const [cx, cy] of t.cells) {
      const x = t.x + cx + dx;
      const y = t.y + cy + dy;
      // Only the squares the hatch would newly cover matter...
      if (covers(t, x, y)) continue;
      if (x < 0 || y < 0 || x >= level.w || y >= level.h) return { no: { kind: "edge" } };
      const k = y * w + x;
      if (level.bales[k]) return { no: { kind: "bale", x, y } };
      if (state.broken.includes(k)) return { no: { kind: "hole", x, y } };
      const arrow = level.arrows[k];
      if (arrow && arrow !== way) return { no: { kind: "arrow", x, y, dir: arrow } };
      if (doorShut(level, state.flipped, k)) return { no: { kind: "door", x, y } };
      if (level.gates[k] && !gate) gate = { x, y };
      if (level.levers[k]) flips++;
      // ...and a square its chained partner is sliding out of is free. (A mirrored one slides
      // the other way, so a square it stands on is in the way.)
      if (t !== mirror && partner && group.some((g) => g !== t && g !== mirror && covers(g, x, y))) continue;
      const other = state.hatches.find((o) => o !== t && (!group.includes(o) || (o === mirror) !== (t === mirror)) && covers(o, x, y));
      if (other) return { no: { kind: "hatch", id: other.id } };
      if (level.burrow?.includes(k)) {
        if (group.length > 1 || t.cells.length > 1) return { no: { kind: "burrow", x, y, why: "big" } };
        burrow = k;
      }
      const crate = state.crates.indexOf(k);
      if (crate >= 0) {
        const to = k + dy * w + dx;
        // Onto plain empty floor, not over a fence, and not into another crate on the move or where a hatch will be.
        if (fenced(level, x, y, way) || !bare(level, state, x + dx, y + dy, true) || pushed.some((p) => p.to === to)) return { no: { kind: "crate", x, y } };
        pushed.push({ id: crate, from: k, to });
      }
      const bird = chickenAt(state.chickens, x, y);
      if (bird) {
        if (bird.color !== t.color && bird.color !== "any") return { no: { kind: "chicken", id: bird.id, hatch: t.id } };
        dropped.push(bird);
        mine++;
      }
      if (!state.keyTaken && level.key && level.key.x === x && level.key.y === y) tookKey = true;
    }
    if (mine > t.left) return { no: { kind: "full", hatch: t.id } };
    eaten.set(t.id, mine);
  }
  // The pecking order: none taken while a lower number is still about (unless it goes now too).
  for (const bird of dropped) {
    if (!bird.order) continue;
    const before = state.chickens.find((c) => c.order && c.order < bird.order! && !dropped.includes(c));
    if (before) {
      const taker = group.find((t) => covers({ ...t, x: t.x + DELTA[wayOf(t)].dx, y: t.y + DELTA[wayOf(t)].dy }, bird.x, bird.y))!;
      return { no: { kind: "order", id: bird.id, hatch: taker.id, need: before.order! } };
    }
  }
  const crates = pushed.length ? state.crates.map((k, id) => pushed.find((p) => p.id === id)?.to ?? k) : state.crates;
  const chickens = dropped.length ? state.chickens.filter((c) => !dropped.includes(c)) : state.chickens;
  const flipped = flips % 2 === 1 ? !state.flipped : state.flipped;

  // Paint: the last puddle a hatch newly covers, in the order of its squares, gives its new colour.
  const painted: Hatch[] = [];
  const turned: Hatch[] = [];
  const others = state.hatches.filter((o) => !group.includes(o));
  const moved: Hatch[] = [];
  for (const t of group) {
    const { dx, dy } = DELTA[wayOf(t)];
    let color = t.color;
    for (const [cx, cy] of t.cells) {
      const x = t.x + cx + dx;
      const y = t.y + cy + dy;
      const fresh = level.paint[y * w + x];
      if (fresh && !covers(t, x, y)) color = fresh;
    }
    let now: Hatch = { ...t, x: t.x + dx, y: t.y + dy, left: t.left - eaten.get(t.id)!, color };
    if (fresh && t.uses !== undefined) now.uses = t.uses - 1;
    if (burrow >= 0) {
      // Down the burrow, and out of the other end if nothing is there.
      const exit = level.burrow![0] === burrow ? level.burrow![1] : level.burrow![0];
      const ex = exit % w;
      const ey = (exit - ex) / w;
      const blocked = crates.includes(exit) || chickens.some((c) => c.x === ex && c.y === ey) || others.some((o) => covers(o, ex, ey));
      if (blocked) return { no: { kind: "burrow", x: burrow % w, y: (burrow - (burrow % w)) / w, why: "exit" } };
      now = { ...now, x: ex, y: ey };
    } else if (group.length === 1 && !t.axis && t.cells.length > 1) {
      // A turntable newly under one of its squares turns it, about that square.
      const pivot = now.cells.find(([cx, cy]) => level.turns[(now.y + cy) * w + now.x + cx] && !covers(t, now.x + cx, now.y + cy));
      if (pivot) {
        const px = now.x + pivot[0];
        const py = now.y + pivot[1];
        const spun = now.cells.map(([cx, cy]) => [px - (now.y + cy - py), py + (now.x + cx - px)] as const);
        for (const [x, y] of spun) {
          if (covers(now, x, y)) continue;
          const k = y * w + x;
          const room = bare(level, { hatches: others, chickens, crates, keyTaken: state.keyTaken, flipped }, x, y, false) && !state.broken.includes(k) && !level.gates[k] && !level.arrows[k] && !level.paint[k];
          if (!room) return { no: { kind: "turn", x: px, y: py } };
        }
        const minX = Math.min(...spun.map(([x]) => x));
        const minY = Math.min(...spun.map(([, y]) => y));
        const cells = spun.map(([x, y]) => [x - minX, y - minY] as const).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
        now = { ...now, x: minX, y: minY, w: Math.max(...cells.map(([x]) => x)) + 1, h: Math.max(...cells.map(([, y]) => y)) + 1, cells };
        turned.push(now);
      }
    }
    if (color !== t.color && now.left > 0) painted.push(now);
    moved.push(now);
  }
  // Mirrored hatches heading for each other can't end up on the same square.
  if (mirror) {
    const [a, b] = [moved[0], moved[moved.length - 1]];
    const clash = a.cells.find(([cx, cy]) => covers(b, a.x + cx, a.y + cy));
    if (clash) return { no: { kind: "hatch", id: b.id } };
  }
  // A crate can't be shoved where a hatch of this move now stands.
  for (const p of pushed) {
    const px = p.to % w;
    if (moved.some((m) => covers(m, px, (p.to - px) / w))) return { no: { kind: "crate", x: p.from % w, y: (p.from - (p.from % w)) / w } };
  }
  const shut = moved.filter((t) => t.left === 0);
  const after = state.hatches.flatMap((t) => {
    const now = moved.find((m) => m.id === t.id);
    return now ? (now.left === 0 ? [] : [now]) : [t];
  });
  // A gate can only be entered while a plate is held down, as things stand after the step.
  const wasOpen = gatesOpen(level, state.hatches);
  const isOpen = gatesOpen(level, after);
  if (gate && !isOpen) return { no: { kind: "gate", ...gate } };
  // A cracked board gives way once nothing is standing on it any more.
  const broke: number[] = [];
  for (const t of group) {
    for (const cell of cellsOf(t)) {
      const k = cell.y * w + cell.x;
      if (level.cracks[k] && !broke.includes(k) && !moved.some((m) => covers(m, cell.x, cell.y))) broke.push(k);
    }
  }
  const broken = broke.length ? [...state.broken, ...broke].sort((a, b) => a - b) : state.broken;
  // Skittish chickens right beside a hatch that slid (and is still on the board) hop on, its way.
  const hopped: Chicken[] = [];
  let flock = chickens;
  const stayed = moved.filter((m) => m.left > 0);
  for (const c of chickens) {
    if (!c.skittish || after.some((t) => covers(t, c.x, c.y))) continue;
    const by = stayed.find((m) => cellsOf(m).some((q) => Math.abs(q.x - c.x) + Math.abs(q.y - c.y) === 1));
    if (!by) continue;
    const way = wayOf(group.find((g) => g.id === by.id)!);
    const x = c.x + DELTA[way].dx;
    const y = c.y + DELTA[way].dy;
    if (fenced(level, c.x, c.y, way) || broken.includes(y * w + x) || !bare(level, { hatches: after, chickens: flock, crates, keyTaken: state.keyTaken || tookKey, flipped }, x, y, false)) continue;
    const now = { ...c, x, y };
    flock = flock.map((b) => (b === c ? now : b));
    hopped.push(now);
  }
  return {
    ok: {
      state: {
        hatches: after,
        chickens: flock,
        broken,
        crates,
        flipped,
        keyTaken: state.keyTaken || tookKey,
        moves: state.lastHatch === mover ? state.moves : state.moves + 1,
        lastHatch: mover,
      },
      dropped,
      moved,
      shut,
      broke,
      tookKey,
      painted,
      gate: wasOpen === isOpen ? null : isOpen ? "opened" : "closed",
      pushed,
      turned,
      burrowed: burrow >= 0,
      slid: 0,
      hopped,
      flipped: flipped !== state.flipped,
    },
  };
}
