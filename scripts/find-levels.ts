// Level search. Builds random boards, then improves each one by small changes (move a
// chicken, reshape a hatch, drop in a hay bale, freeze or padlock a hatch...), keeping a
// change whenever the solver says the level is still winnable and needs at least as many
// moves as before. The best boards are printed as ready-to-paste entries for levels.ts.
//
//   npm run levels                      every tier, default seed, 60 s each
//   npm run levels -- shapes 42 120     the "shapes" tier, seed 42, 120 s
//
// Tiers: tiny, small, medium, large (plain boards), shapes, ice, lock, mix (harder pieces).
//
// "Moves" here means the game's own count: how many times you have to change hatch. That is
// only a rough stand-in for difficulty, so curate by playing what this prints.

import { parseLevel, startState } from "../src/game/engine";
import { solve } from "../src/game/solver";
import { COLORS } from "../src/game/types";
import type { Axis, Color, Level, LevelDef } from "../src/game/types";

type Shape = string[];
const RECT = { dot: ["x"], wide: ["xx"], tall: ["x", "x"], long: ["xxx"], high: ["x", "x", "x"], square: ["xx", "xx"] } satisfies Record<string, Shape>;
const ELLS: Shape[] = [["x.", "xx"], [".x", "xx"], ["xx", "x."], ["xx", ".x"], ["x.", "x.", "xx"], [".x", ".x", "xx"], ["xx", "x.", "x."], ["xx", ".x", ".x"], ["xxx", "x.."], ["xxx", "..x"], ["x..", "xxx"], ["..x", "xxx"]];
const TEES: Shape[] = [["xxx", ".x."], [".x.", "xxx"], ["x.", "xx", "x."], [".x", "xx", ".x"]];
const PLAIN: Shape[] = [RECT.dot, RECT.wide, RECT.tall, RECT.wide, RECT.tall, RECT.long, RECT.high, RECT.square];
const isRect = (s: Shape) => s.every((r) => !r.includes("."));

interface Tier {
  name: string;
  w: [number, number];
  h: [number, number];
  colors: [number, number];
  hatches: [number, number];
  shapes: Shape[];
  cap: [number, number];
  bales: [number, number];
  rail: number; // chance a hatch starts railed
  /** Stop improving a board once it needs this many moves. */
  target: number;
  /** Harder pieces this tier must use. */
  odd?: number; // at least this many hatches that are not rectangles
  ice?: boolean; // at least one frozen hatch
  lock?: boolean; // a key and at least one padlocked hatch
  eggs?: number; // share of chickens still in their eggs
}

const TIERS: Tier[] = [
  { name: "tiny", w: [4, 4], h: [4, 5], colors: [2, 2], hatches: [2, 3], shapes: [RECT.dot, RECT.wide, RECT.tall], cap: [1, 3], bales: [0, 1], rail: 0, target: 4 },
  { name: "small", w: [5, 5], h: [5, 5], colors: [2, 3], hatches: [3, 4], shapes: PLAIN.slice(0, 7), cap: [1, 3], bales: [0, 2], rail: 0, target: 7 },
  { name: "medium", w: [5, 5], h: [6, 6], colors: [3, 4], hatches: [4, 6], shapes: PLAIN, cap: [1, 3], bales: [1, 3], rail: 0.15, target: 10 },
  { name: "large", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 7], shapes: PLAIN, cap: [1, 3], bales: [1, 4], rail: 0.15, target: 14 },
  { name: "shapes", w: [5, 6], h: [6, 6], colors: [3, 4], hatches: [4, 6], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [0, 3], rail: 0.1, target: 13, odd: 2 },
  { name: "ice", w: [5, 6], h: [6, 6], colors: [3, 4], hatches: [4, 6], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0.1, target: 13, ice: true },
  { name: "lock", w: [5, 6], h: [6, 6], colors: [3, 4], hatches: [4, 6], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0.1, target: 13, lock: true },
  { name: "mix", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 7], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [1, 4], rail: 0.1, target: 16, odd: 1, ice: true, lock: true, eggs: 0.35 },
];

/** A level while it is still being changed: every piece is its own record. */
interface Draft {
  w: number;
  h: number;
  bales: Set<number>;
  key: number | null;
  birds: { color: Color; k: number; hidden: boolean }[];
  hatches: { color: Color; x: number; y: number; shape: Shape; axis?: Axis; ice?: number; locked?: boolean }[];
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAR: Record<Color, string> = { red: "r", gold: "y", teal: "t", blue: "b", plum: "p" };

const copy = (d: Draft): Draft => ({ ...d, bales: new Set(d.bales), birds: d.birds.map((b) => ({ ...b })), hatches: d.hatches.map((t) => ({ ...t })) });

const cellsOf = (d: Draft, t: Draft["hatches"][number], x = t.x, y = t.y) => t.shape.flatMap((row, dy) => [...row].flatMap((ch, dx) => (ch === "x" ? [(y + dy) * d.w + x + dx] : [])));

function taken(d: Draft, skipHatch = -1): Set<number> {
  const out = new Set<number>(d.bales);
  if (d.key !== null) out.add(d.key);
  for (const b of d.birds) out.add(b.k);
  d.hatches.forEach((t, i) => i !== skipHatch && cellsOf(d, t).forEach((k) => out.add(k)));
  return out;
}

function freeCell(d: Draft, rnd: () => number): number | null {
  const used = taken(d);
  const open = [];
  for (let k = 0; k < d.w * d.h; k++) if (!used.has(k)) open.push(k);
  return open.length ? open[Math.floor(rnd() * open.length)] : null;
}

/** Find room for hatch `i` at its current shape, or report failure. */
function seat(d: Draft, i: number, rnd: () => number): boolean {
  const t = d.hatches[i];
  const used = taken(d, i);
  const bw = t.shape[0].length;
  const bh = t.shape.length;
  if (bw > d.w || bh > d.h) return false;
  for (let tries = 0; tries < 40; tries++) {
    const x = Math.floor(rnd() * (d.w - bw + 1));
    const y = Math.floor(rnd() * (d.h - bh + 1));
    if (cellsOf(d, t, x, y).every((k) => !used.has(k))) {
      t.x = x;
      t.y = y;
      return true;
    }
  }
  return false;
}

/** Does the draft use every harder piece its tier asks for? */
function fits(d: Draft, tier: Tier): boolean {
  if (tier.odd && d.hatches.filter((t) => !isRect(t.shape)).length < tier.odd) return false;
  if (tier.ice && !d.hatches.some((t) => t.ice)) return false;
  if (tier.lock && (d.key === null || !d.hatches.some((t) => t.locked))) return false;
  if (!tier.ice && d.hatches.some((t) => t.ice)) return false;
  if (!tier.lock && (d.key !== null || d.hatches.some((t) => t.locked))) return false;
  if (d.hatches.some((t) => t.axis && !isRect(t.shape))) return false;
  if (d.hatches.filter((t) => t.ice || t.locked).length > Math.ceil(d.hatches.length / 2)) return false;
  return true;
}

function toDef(d: Draft): LevelDef | null {
  const grid: string[] = new Array(d.w * d.h).fill(".");
  for (const k of d.bales) grid[k] = "#";
  if (d.key !== null) grid[d.key] = "k";
  for (const b of d.birds) grid[b.k] = b.hidden ? CHAR[b.color].toUpperCase() : CHAR[b.color];
  const hatches: LevelDef["hatches"] = d.hatches.map((t) => {
    const rect = isRect(t.shape);
    const bw = t.shape[0].length;
    const bh = t.shape.length;
    return {
      color: t.color,
      x: t.x,
      y: t.y,
      ...(rect && bw > 1 ? { w: bw } : {}),
      ...(rect && bh > 1 ? { h: bh } : {}),
      ...(rect ? {} : { shape: t.shape }),
      cap: 0,
      ...(t.axis ? { axis: t.axis } : {}),
      ...(t.ice ? { ice: t.ice } : {}),
      ...(t.locked ? { locked: true } : {}),
    };
  });
  // Each colour's chickens are shared out between its hatches, one at a time.
  for (const color of COLORS) {
    const mine = hatches.filter((t) => t.color === color);
    let birds = d.birds.filter((b) => b.color === color).length;
    if (!mine.length && !birds) continue;
    if (birds < mine.length || !mine.length) return null;
    mine.forEach((t) => (t.cap = 1));
    birds -= mine.length;
    for (let i = 0; birds > 0; i = (i + 1) % mine.length, birds--) mine[i].cap++;
  }
  const rows: string[] = [];
  for (let y = 0; y < d.h; y++) rows.push(grid.slice(y * d.w, (y + 1) * d.w).join(""));
  return { name: "untitled", rows, hatches, par: 0 };
}

function build(tier: Tier, rnd: () => number): Draft | null {
  const int = ([lo, hi]: [number, number]) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const d: Draft = { w: int(tier.w), h: int(tier.h), bales: new Set(), key: null, birds: [], hatches: [] };
  for (let i = int(tier.bales); i > 0; i--) d.bales.add(Math.floor(rnd() * d.w * d.h));
  if (tier.lock) d.key = freeCell(d, rnd);

  const colors = [...COLORS].sort(() => rnd() - 0.5).slice(0, int(tier.colors));
  const count = Math.max(colors.length, int(tier.hatches));
  const owners = [...colors];
  while (owners.length < count) owners.push(pick(colors));
  owners.forEach((color, i) => {
    const odd = tier.odd && i < tier.odd;
    const shape = odd ? pick([...ELLS, ...TEES]) : pick(tier.shapes);
    const axis: Axis | undefined = isRect(shape) && rnd() < tier.rail ? (rnd() < 0.5 ? "h" : "v") : undefined;
    d.hatches.push({ color, x: 0, y: 0, shape, ...(axis ? { axis } : {}) });
  });
  if (tier.ice) pick(d.hatches).ice = 1 + Math.floor(rnd() * 3);
  if (tier.lock) pick(d.hatches).locked = true;
  for (let i = 0; i < d.hatches.length; i++) {
    if (!seat(d, i, rnd)) return null;
    for (let n = int(tier.cap); n > 0; n--) {
      const k = freeCell(d, rnd);
      if (k === null) return null;
      d.birds.push({ color: d.hatches[i].color, k, hidden: rnd() < (tier.eggs ?? 0) });
    }
  }
  return fits(d, tier) ? d : null;
}

/** One small random change. Returns null when the change does not fit. */
function mutate(src: Draft, tier: Tier, rnd: () => number): Draft | null {
  const d = copy(src);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const roll = rnd();
  if (roll < 0.26) {
    // move a chicken
    const k = freeCell(d, rnd);
    if (k === null) return null;
    pick(d.birds).k = k;
  } else if (roll < 0.44) {
    // move a hatch
    if (!seat(d, Math.floor(rnd() * d.hatches.length), rnd)) return null;
  } else if (roll < 0.56) {
    // reshape a hatch
    const i = Math.floor(rnd() * d.hatches.length);
    d.hatches[i].shape = pick(tier.shapes);
    if (!isRect(d.hatches[i].shape)) delete d.hatches[i].axis;
    if (!seat(d, i, rnd)) return null;
  } else if (roll < 0.66) {
    // add or remove a hay bale
    if (d.bales.size && rnd() < 0.5) d.bales.delete(pick([...d.bales]));
    else {
      const k = freeCell(d, rnd);
      if (k === null || d.bales.size >= tier.bales[1]) return null;
      d.bales.add(k);
    }
  } else if (roll < 0.76) {
    // one more chicken, or one fewer
    if (rnd() < 0.5) {
      const k = freeCell(d, rnd);
      if (k === null) return null;
      d.birds.push({ color: pick(d.hatches).color, k, hidden: rnd() < (tier.eggs ?? 0) });
    } else d.birds.splice(Math.floor(rnd() * d.birds.length), 1);
  } else if (roll < 0.82) {
    // recolour a chicken
    pick(d.birds).color = pick(d.hatches).color;
  } else if (roll < 0.87) {
    // add or remove a rail
    const t = pick(d.hatches);
    if (t.axis) delete t.axis;
    else if (tier.rail > 0 && isRect(t.shape)) t.axis = rnd() < 0.5 ? "h" : "v";
    else return null;
  } else if (roll < 0.94) {
    // freeze, thaw or re-time a hatch
    if (!tier.ice) return null;
    const t = pick(d.hatches);
    if (t.ice && rnd() < 0.4) delete t.ice;
    else t.ice = 1 + Math.floor(rnd() * 5);
  } else {
    // padlock or free a hatch, or move the key
    if (!tier.lock) return null;
    if (rnd() < 0.5) d.key = freeCell(d, rnd);
    else {
      const t = pick(d.hatches);
      if (t.locked) delete t.locked;
      else t.locked = true;
    }
  }
  // Keep a little bare floor so there is always somewhere to slide.
  if (d.w * d.h - taken(d).size < 3) return null;
  return fits(d, tier) ? d : null;
}

function par(d: Draft, cap: number): { def: LevelDef; level: Level; moves: number; explored: number } | null {
  const def = toDef(d);
  if (!def) return null;
  let level: Level;
  try {
    level = parseLevel(def, 0);
  } catch {
    return null;
  }
  const r = solve(level, startState(level), cap);
  if (r.status !== "solved") return null;
  def.par = r.moves;
  return { def, level, moves: r.moves, explored: r.explored };
}

function show(def: LevelDef) {
  const lines = def.rows.map((r) => [...r]);
  const level = parseLevel(def, 0);
  for (const t of level.hatches) for (const [dx, dy] of t.cells) lines[t.y + dy][t.x + dx] = String(t.id);
  const notes = level.hatches.map((t) => `${t.id}=${t.color}×${t.left}${t.axis ? " rail-" + t.axis : ""}${t.ice ? " ice" + t.ice : ""}${t.locked ? " locked" : ""}`).join(", ");
  return lines.map((l) => "      // " + l.join(" ")).join("\n") + `\n      // ${notes}`;
}

const [tierArg, seedArg, secondsArg] = process.argv.slice(2);
const seed = Number(seedArg ?? 7);
const seconds = Number(secondsArg ?? 60);
const which = tierArg === undefined ? TIERS : TIERS.filter((t, i) => t.name === tierArg || String(i) === tierArg);

for (const tier of which) {
  const rnd = mulberry32(seed * 1000 + TIERS.indexOf(tier));
  const until = Date.now() + seconds * 1000;
  const found: { def: LevelDef; explored: number }[] = [];
  let climbs = 0;
  while (Date.now() < until) {
    const first = build(tier, rnd);
    let best = first && par(first, 40_000);
    if (!first || !best) continue;
    let draft = first;
    climbs++;
    const giveUp = Math.min(until, Date.now() + 45_000);
    for (let i = 0; i < 400 && best.moves < tier.target && Date.now() < giveUp; i++) {
      const next = mutate(draft, tier, rnd);
      const scored = next && par(next, 120_000);
      if (next && scored && scored.moves >= best.moves) {
        draft = next;
        best = scored;
      }
    }
    found.push({ def: best.def, explored: best.explored });
    console.error(`${tier.name}: board ${climbs} reached par ${best.def.par}`);
  }
  found.sort((a, b) => b.def.par - a.def.par);
  console.log(`\n// ── ${tier.name}: ${climbs} boards grown in ${seconds} s (seed ${seed}) ──`);
  for (const f of found.slice(0, 9)) {
    console.log(`  // par ${f.def.par}, ${f.explored} positions searched`);
    console.log(show(f.def));
    console.log(
      `  { name: "untitled", rows: ${JSON.stringify(f.def.rows)}, par: ${f.def.par}, hatches: [${f.def.hatches
        .map((t) => JSON.stringify(t).replace(/"(\w+)":/g, "$1: "))
        .join(", ")}] },`,
    );
  }
}
