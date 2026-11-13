// Level growing. Builds random boards, then improves each one by small changes (move a
// chicken, reshape a hatch, drop in a hay bale, freeze or padlock a hatch...), keeping a change
// whenever the solver says the level is still winnable and needs at least as many moves.
//
// Shared by `npm run levels` (scripts/find-levels.ts), which searches for minutes and prints the
// best boards for levels.ts, and by the game's endless mode, which grows one coop at a time in a
// worker in a second or two.

import { parseLevel, startState, step } from "./engine";
import { solve } from "./solver";
import { COLORS, DIRS } from "./types";
import type { Axis, Color, Dir, Feather, GameState, Level, LevelDef } from "./types";

type Shape = string[];
const RECT = { dot: ["x"], wide: ["xx"], tall: ["x", "x"], long: ["xxx"], high: ["x", "x", "x"], square: ["xx", "xx"] } satisfies Record<string, Shape>;
const ELLS: Shape[] = [["x.", "xx"], [".x", "xx"], ["xx", "x."], ["xx", ".x"], ["x.", "x.", "xx"], [".x", ".x", "xx"], ["xx", "x.", "x."], ["xx", ".x", ".x"], ["xxx", "x.."], ["xxx", "..x"], ["x..", "xxx"], ["..x", "xxx"]];
const TEES: Shape[] = [["xxx", ".x."], [".x.", "xxx"], ["x.", "xx", "x."], [".x", "xx", ".x"]];
const PLAIN: Shape[] = [RECT.dot, RECT.wide, RECT.tall, RECT.wide, RECT.tall, RECT.long, RECT.high, RECT.square];
const isRect = (s: Shape) => s.every((r) => !r.includes("."));

export interface Tier {
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
  crack?: [number, number]; // how many cracked boards
  wild?: number; // share of chickens that are white
  link?: boolean; // one chained pair of hatches
  paint?: [number, number]; // how many paint puddles
  gate?: boolean; // a pressure plate and some gate squares
  arrows?: [number, number]; // how many one-way squares
  /** Hard tiers climb for longer and let the solver look further (still within what a hint can search). */
  hard?: boolean;
}

export const TIERS: Tier[] = [
  { name: "tiny", w: [4, 4], h: [4, 5], colors: [2, 2], hatches: [2, 3], shapes: [RECT.dot, RECT.wide, RECT.tall], cap: [1, 3], bales: [0, 1], rail: 0, target: 4 },
  { name: "small", w: [5, 5], h: [5, 5], colors: [2, 3], hatches: [3, 4], shapes: PLAIN.slice(0, 7), cap: [1, 3], bales: [0, 2], rail: 0, target: 7 },
  { name: "medium", w: [5, 5], h: [6, 6], colors: [3, 4], hatches: [4, 6], shapes: PLAIN, cap: [1, 3], bales: [1, 3], rail: 0.15, target: 10 },
  { name: "large", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 7], shapes: PLAIN, cap: [1, 3], bales: [1, 4], rail: 0.15, target: 14 },
  { name: "shapes", w: [5, 6], h: [6, 6], colors: [3, 4], hatches: [4, 6], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [0, 3], rail: 0.1, target: 13, odd: 2 },
  { name: "ice", w: [5, 6], h: [6, 6], colors: [3, 4], hatches: [4, 6], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0.1, target: 13, ice: true },
  { name: "lock", w: [5, 6], h: [6, 6], colors: [3, 4], hatches: [4, 6], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0.1, target: 13, lock: true },
  { name: "mix", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 7], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [1, 4], rail: 0.1, target: 16, odd: 1, ice: true, lock: true, eggs: 0.35 },
  { name: "eggs", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [4, 5], shapes: [...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0, target: 12, eggs: 0.5 },
  { name: "crack", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [3, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 2], rail: 0, target: 12, crack: [2, 6] },
  { name: "wild", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [3, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0, target: 12, wild: 0.25 },
  { name: "link", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [4, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0, target: 12, link: true },
  { name: "crack-ice", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [4, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 2], rail: 0, target: 14, crack: [2, 5], ice: true },
  { name: "wild-eggs", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [4, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0, target: 14, wild: 0.2, eggs: 0.4 },
  { name: "link-lock", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [4, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0, target: 14, link: true, lock: true },
  { name: "link-shapes", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [4, 5], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [0, 3], rail: 0, target: 14, link: true, odd: 2 },
  { name: "medley", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 6], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [0, 3], rail: 0, target: 22, crack: [2, 6], wild: 0.2, link: true, hard: true },
  { name: "xl", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 7], shapes: PLAIN, cap: [1, 3], bales: [1, 5], rail: 0.2, target: 26, hard: true },
  { name: "shapes-hard", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 7], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [0, 4], rail: 0.1, target: 26, odd: 3, hard: true },
  { name: "ice-hard", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 7], shapes: [...PLAIN, ...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [0, 4], rail: 0.1, target: 24, ice: true, hard: true },
  { name: "lock-hard", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 7], shapes: [...PLAIN, ...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [0, 4], rail: 0.1, target: 24, lock: true, hard: true },
  { name: "paint", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [3, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0.1, target: 16, paint: [1, 3] },
  { name: "gate", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [4, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [1, 4], rail: 0.1, target: 16, gate: true },
  { name: "arrow", w: [5, 6], h: [5, 6], colors: [3, 4], hatches: [3, 5], shapes: [...PLAIN, ...PLAIN, ...ELLS], cap: [1, 3], bales: [0, 3], rail: 0.1, target: 16, arrows: [2, 5] },
  { name: "workshop", w: [6, 6], h: [6, 7], colors: [4, 5], hatches: [5, 6], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [0, 4], rail: 0.1, target: 26, paint: [1, 2], gate: true, arrows: [2, 4], hard: true },
  { name: "mix-hard", w: [6, 7], h: [7, 7], colors: [5, 5], hatches: [6, 8], shapes: [...PLAIN, ...ELLS, ...TEES], cap: [1, 3], bales: [1, 5], rail: 0.1, target: 30, odd: 2, ice: true, lock: true, eggs: 0.35, hard: true },
];

/** A level while it is still being changed: every piece is its own record. */
export interface Draft {
  w: number;
  h: number;
  bales: Set<number>;
  cracks: Set<number>;
  key: number | null;
  paint: Map<number, Color>;
  plates: Set<number>;
  gates: Set<number>;
  arrows: Map<number, Dir>;
  birds: { color: Feather; k: number; hidden: boolean }[];
  /** `extra` is room beyond the hatch's share of its own colour: room that white chickens must fill. */
  hatches: { color: Color; x: number; y: number; shape: Shape; axis?: Axis; ice?: number; locked?: boolean; link?: string; extra?: number }[];
}

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CHAR: Record<Feather, string> = { red: "r", gold: "y", teal: "t", blue: "b", plum: "p", any: "w" };

const copy = (d: Draft): Draft => ({
  ...d,
  bales: new Set(d.bales),
  cracks: new Set(d.cracks),
  paint: new Map(d.paint),
  plates: new Set(d.plates),
  gates: new Set(d.gates),
  arrows: new Map(d.arrows),
  birds: d.birds.map((b) => ({ ...b })),
  hatches: d.hatches.map((t) => ({ ...t })),
});
const ARROW: Record<Dir, string> = { up: "^", down: "v", left: "<", right: ">" };

const cellsOf = (d: Draft, t: Draft["hatches"][number], x = t.x, y = t.y) => t.shape.flatMap((row, dy) => [...row].flatMap((ch, dx) => (ch === "x" ? [(y + dy) * d.w + x + dx] : [])));

function taken(d: Draft, skipHatch = -1): Set<number> {
  const out = new Set<number>([...d.bales, ...d.cracks, ...d.paint.keys(), ...d.plates, ...d.gates, ...d.arrows.keys()]);
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
  if (d.cracks.size < (tier.crack?.[0] ?? 0) || d.cracks.size > (tier.crack?.[1] ?? 0)) return false;
  if (d.hatches.filter((t) => t.link).length !== (tier.link ? 2 : 0)) return false;
  const white = d.birds.filter((b) => b.color === "any").length;
  if (white !== d.hatches.reduce((n, t) => n + (t.extra ?? 0), 0)) return false;
  if (tier.wild ? white < 1 || white > Math.ceil(d.birds.length / 2) : white > 0) return false;
  if (d.paint.size < (tier.paint?.[0] ?? 0) || d.paint.size > (tier.paint?.[1] ?? 0)) return false;
  if (tier.gate ? !d.plates.size || !d.gates.size || d.plates.size > 2 || d.gates.size > 4 : d.plates.size || d.gates.size) return false;
  if (d.arrows.size < (tier.arrows?.[0] ?? 0) || d.arrows.size > (tier.arrows?.[1] ?? 0)) return false;
  return true;
}

function toDef(d: Draft): LevelDef | null {
  const grid: string[] = new Array(d.w * d.h).fill(".");
  for (const k of d.bales) grid[k] = "#";
  for (const k of d.cracks) grid[k] = "~";
  if (d.key !== null) grid[d.key] = "k";
  for (const [k, c] of d.paint) grid[k] = String(COLORS.indexOf(c) + 1);
  for (const k of d.plates) grid[k] = "o";
  for (const k of d.gates) grid[k] = "=";
  for (const [k, dir] of d.arrows) grid[k] = ARROW[dir];
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
      ...(t.link ? { link: t.link } : {}),
    };
  });
  if (d.paint.size) {
    // Paint changes colours mid-game, so only the totals have to agree: each hatch takes one
    // chicken of its own colour if there is one (or any other), then the rest go to hatches
    // of their colour, or round the hatches in turn when no hatch starts in it.
    const pool = d.birds.filter((b) => b.color !== "any").map((b) => b.color as Color);
    if (pool.length < hatches.length) return null;
    for (const t of hatches) {
      const i = pool.indexOf(t.color);
      pool.splice(i >= 0 ? i : 0, 1);
      t.cap = 1;
    }
    pool.forEach((color, n) => {
      const mine = hatches.filter((t) => t.color === color);
      (mine.length ? mine[n % mine.length] : hatches[n % hatches.length]).cap++;
    });
  }
  // Each colour's chickens are shared out between its hatches, one at a time.
  for (const color of d.paint.size ? [] : COLORS) {
    const mine = hatches.filter((t) => t.color === color);
    let birds = d.birds.filter((b) => b.color === color).length;
    if (!mine.length && !birds) continue;
    if (birds < mine.length || !mine.length) return null;
    mine.forEach((t) => (t.cap = 1));
    birds -= mine.length;
    for (let i = 0; birds > 0; i = (i + 1) % mine.length, birds--) mine[i].cap++;
  }
  d.hatches.forEach((t, i) => (hatches[i].cap += t.extra ?? 0));
  const rows: string[] = [];
  for (let y = 0; y < d.h; y++) rows.push(grid.slice(y * d.w, (y + 1) * d.w).join(""));
  return { id: "untitled", name: "untitled", rows, hatches, par: 0 };
}

export function build(tier: Tier, rnd: () => number): Draft | null {
  const int = ([lo, hi]: [number, number]) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const d: Draft = { w: int(tier.w), h: int(tier.h), bales: new Set(), cracks: new Set(), key: null, paint: new Map(), plates: new Set(), gates: new Set(), arrows: new Map(), birds: [], hatches: [] };
  for (let i = int(tier.bales); i > 0; i--) d.bales.add(Math.floor(rnd() * d.w * d.h));
  for (let i = tier.crack ? int(tier.crack) : 0; i > 0; i--) {
    const k = freeCell(d, rnd);
    if (k !== null) d.cracks.add(k);
  }
  if (tier.lock) d.key = freeCell(d, rnd);
  if (tier.gate) {
    const plate = freeCell(d, rnd);
    if (plate !== null) d.plates.add(plate);
    for (let i = int([1, 3]); i > 0; i--) {
      const k = freeCell(d, rnd);
      if (k !== null) d.gates.add(k);
    }
  }
  for (let i = tier.arrows ? int(tier.arrows) : 0; i > 0; i--) {
    const k = freeCell(d, rnd);
    if (k !== null) d.arrows.set(k, pick(DIRS));
  }

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
  if (tier.link) {
    const a = Math.floor(rnd() * d.hatches.length);
    const b = (a + 1 + Math.floor(rnd() * (d.hatches.length - 1))) % d.hatches.length;
    d.hatches[a].link = d.hatches[b].link = "a";
  }
  for (let i = 0; i < d.hatches.length; i++) {
    if (!seat(d, i, rnd)) return null;
    for (let n = int(tier.cap); n > 0; n--) {
      const k = freeCell(d, rnd);
      if (k === null) return null;
      d.birds.push({ color: d.hatches[i].color, k, hidden: rnd() < (tier.eggs ?? 0) });
    }
  }
  // Paint: puddles of the colours in play, or of one no hatch starts in, and some chickens
  // turned that colour so that a hatch has to be painted to take them.
  if (tier.paint) {
    const spare = COLORS.filter((c) => !colors.includes(c));
    const palette = [...colors, ...spare.slice(0, 1)];
    for (let i = int(tier.paint); i > 0; i--) {
      const k = freeCell(d, rnd);
      if (k === null) return null;
      d.paint.set(k, pick(palette));
    }
    const colours = [...new Set(d.paint.values())];
    for (const b of d.birds) if (rnd() < 0.3) b.color = pick(colours);
  }
  // White chickens: each needs a spare place in some hatch.
  for (let n = tier.wild ? Math.max(1, Math.round(d.birds.length * tier.wild)) : 0; n > 0; n--) {
    const k = freeCell(d, rnd);
    if (k === null) return null;
    d.birds.push({ color: "any", k, hidden: false });
    const t = pick(d.hatches);
    t.extra = (t.extra ?? 0) + 1;
  }
  return fits(d, tier) ? d : null;
}

/** One small random change. Returns null when the change does not fit. */
export function mutate(src: Draft, tier: Tier, rnd: () => number): Draft | null {
  const d = copy(src);
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const special = rnd();
  if (special < 0.22 && (tier.paint || tier.gate || tier.arrows)) {
    // one of the newest pieces: move, add or change a puddle, a plate, a gate square or an arrow
    const kinds = [tier.paint ? "paint" : "", tier.gate ? "gate" : "", tier.arrows ? "arrow" : ""].filter(Boolean);
    const kind = pick(kinds);
    const roll = rnd();
    if (kind === "paint") {
      const colours = [...new Set([...d.hatches.map((t) => t.color), ...d.paint.values()])];
      if (roll < 0.35 && d.paint.size) {
        // recolour a puddle
        d.paint.set(pick([...d.paint.keys()]), pick(COLORS));
      } else if (roll < 0.65 && d.paint.size) {
        // move a puddle
        const from = pick([...d.paint.keys()]);
        const c = d.paint.get(from)!;
        d.paint.delete(from);
        const k = freeCell(d, rnd);
        if (k === null) return null;
        d.paint.set(k, c);
      } else if (roll < 0.8) {
        const k = freeCell(d, rnd);
        if (k === null) return null;
        d.paint.set(k, pick(colours));
      } else if (d.paint.size) d.paint.delete(pick([...d.paint.keys()]));
      // keep the chickens to colours that can be taken
      const reachable = new Set<Feather>([...d.hatches.map((t) => t.color), ...d.paint.values(), "any"]);
      if (d.birds.some((b) => !reachable.has(b.color))) return null;
    } else if (kind === "gate") {
      if (roll < 0.3 && d.plates.size) {
        d.plates.delete(pick([...d.plates]));
        const k = freeCell(d, rnd);
        if (k === null) return null;
        d.plates.add(k);
      } else if (roll < 0.6 && d.gates.size) {
        d.gates.delete(pick([...d.gates]));
        const k = freeCell(d, rnd);
        if (k === null) return null;
        d.gates.add(k);
      } else if (roll < 0.8) {
        const k = freeCell(d, rnd);
        if (k === null) return null;
        (rnd() < 0.8 ? d.gates : d.plates).add(k);
      } else if (d.gates.size > 1) d.gates.delete(pick([...d.gates]));
      else return null;
    } else {
      if (roll < 0.35 && d.arrows.size) d.arrows.set(pick([...d.arrows.keys()]), pick(DIRS));
      else if (roll < 0.65 && d.arrows.size) {
        const from = pick([...d.arrows.keys()]);
        const dir = d.arrows.get(from)!;
        d.arrows.delete(from);
        const k = freeCell(d, rnd);
        if (k === null) return null;
        d.arrows.set(k, dir);
      } else if (roll < 0.82) {
        const k = freeCell(d, rnd);
        if (k === null) return null;
        d.arrows.set(k, pick(DIRS));
      } else if (d.arrows.size) d.arrows.delete(pick([...d.arrows.keys()]));
    }
    if (d.w * d.h - taken(d).size < 3) return null;
    return fits(d, tier) ? d : null;
  }
  if (special < 0.18 && (tier.crack || tier.wild || tier.link)) {
    // one of the later pieces: move a cracked board, a white chicken's place, or the chain
    const kinds = [tier.crack ? "crack" : "", tier.wild ? "wild" : "", tier.link ? "link" : ""].filter(Boolean);
    const kind = pick(kinds);
    if (kind === "crack") {
      if (d.cracks.size && rnd() < 0.5) d.cracks.delete(pick([...d.cracks]));
      if (rnd() < 0.75) {
        const k = freeCell(d, rnd);
        if (k === null) return null;
        d.cracks.add(k);
      }
    } else if (kind === "wild") {
      const spare = d.hatches.filter((t) => t.extra);
      if (rnd() < 0.5 && spare.length) {
        // give one white chicken's place to a different hatch
        pick(spare).extra!--;
        const t = pick(d.hatches);
        t.extra = (t.extra ?? 0) + 1;
      } else if (rnd() < 0.5) {
        const k = freeCell(d, rnd);
        if (k === null) return null;
        d.birds.push({ color: "any", k, hidden: false });
        const t = pick(d.hatches);
        t.extra = (t.extra ?? 0) + 1;
      } else if (spare.length) {
        d.birds.splice(d.birds.findIndex((b) => b.color === "any"), 1);
        pick(spare).extra!--;
      }
    } else {
      const chained = d.hatches.filter((t) => t.link);
      const loose = d.hatches.filter((t) => !t.link);
      if (!chained.length || !loose.length) return null;
      delete pick(chained).link;
      pick(loose).link = "a";
    }
    if (d.w * d.h - taken(d).size < 3) return null;
    return fits(d, tier) ? d : null;
  }
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
    } else {
      const coloured = d.birds.map((b, i) => (b.color === "any" ? -1 : i)).filter((i) => i >= 0);
      if (!coloured.length) return null;
      d.birds.splice(pick(coloured), 1);
    }
  } else if (roll < 0.82) {
    // recolour a chicken (white ones stay white: their places are counted separately)
    const coloured = d.birds.filter((b) => b.color !== "any");
    if (!coloured.length) return null;
    pick(coloured).color = d.paint.size && rnd() < 0.4 ? pick([...d.paint.values()]) : pick(d.hatches).color;
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

export function par(d: Draft, cap: number): { def: LevelDef; level: Level; moves: number; explored: number } | null {
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

/**
 * How often careless play ruins the level. Play at random (but keen to drop chickens) until
 * half of them are down, then ask the solver whether the level can still be won. Returns the
 * share of such games that could not, from 0 to 1.
 */
export function traps(level: Level, rnd: () => number, games = 12, search = 20_000): number {
  let lost = 0;
  let judged = 0;
  for (let g = 0; g < games; g++) {
    let s: GameState = startState(level);
    const stopAt = Math.floor(level.chickens.length / 2);
    for (let i = 0; i < 250 && s.chickens.length > stopAt; i++) {
      const quiet: GameState[] = [];
      const drops: GameState[] = [];
      for (const t of s.hatches) {
        for (const dir of DIRS) {
          const out = step(level, s, t.id, dir);
          if (out) (out.dropped.length ? drops : quiet).push(out.state);
        }
      }
      const from = drops.length && (rnd() < 0.6 || !quiet.length) ? drops : quiet;
      if (!from.length) break;
      s = from[Math.floor(rnd() * from.length)];
    }
    if (s.chickens.length === 0) {
      judged++;
      continue;
    }
    const r = solve(level, s, search);
    if (r.status === "unknown") continue;
    judged++;
    if (r.status === "stuck") lost++;
  }
  return judged ? lost / judged : 0;
}


/**
 * Grow one level for the game: climb boards of `tier` towards `target` moves for at most
 * `budgetMs`, keeping the best board found. Returns null if nothing solvable turned up.
 */
export function grow(tierName: string, seed: number, budgetMs: number, target: number): LevelDef | null {
  const chosen = TIERS.find((t) => t.name === tierName);
  if (!chosen) throw new Error(`no tier "${tierName}"`);
  const tier: Tier = { ...chosen, target };
  const rnd = mulberry32(seed);
  const until = Date.now() + budgetMs;
  let best: { def: LevelDef; moves: number } | null = null;
  while (Date.now() < until && (!best || best.moves < target)) {
    const first = build(tier, rnd);
    let now = first && par(first, 15_000);
    if (!first || !now) continue;
    let draft = first;
    // Each climb gets a share of the time, so one dull board can't use it all.
    const climbUntil = Math.min(until, Date.now() + budgetMs / 3);
    while (now.moves < target && Date.now() < climbUntil) {
      const next = mutate(draft, tier, rnd);
      const scored = next && par(next, 30_000);
      if (next && scored && scored.moves >= now.moves) {
        draft = next;
        now = scored;
      }
    }
    if (!best || now.moves > best.moves) best = { def: now.def, moves: now.moves };
  }
  return best && best.moves >= 2 ? best.def : null;
}
