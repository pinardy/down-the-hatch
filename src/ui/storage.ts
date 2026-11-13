// Progress and settings, kept in this browser. Every read and write is guarded:
// storage can be missing or full, and the game must still play.

import type { BoardTheme, Hat } from "./rewards";

export interface Settings {
  sound: boolean;
  /** Race a countdown on every level. Off by default: this is a thinking game. */
  clock: boolean;
  /** Daylight or lamplight, or whichever the device is set to. */
  theme: "system" | "light" | "dark";
  /** Everything but the board a size larger. */
  bigText: boolean;
  /** Looks bought with eggs (see rewards.ts). */
  board: BoardTheme;
  hat: Hat;
}

/** What is remembered about a level once it has been cleared. */
export interface Cleared {
  /** Fewest moves used. */
  moves: number;
  /** Cleared at least once without asking for a hint or watching the solution. */
  solo?: boolean;
  /** Cleared at least once inside the time allowed, with Race the clock on. */
  clock?: boolean;
  /** A daily coop only ever cleared after its own day was over. It doesn't count towards the streak. */
  late?: boolean;
}

/** A record with only the flags that are set, so equal records compare equal. */
function record(moves: number, solo?: boolean, clock?: boolean, late?: boolean): Cleared {
  return { moves, ...(solo ? { solo: true } : {}), ...(clock ? { clock: true } : {}), ...(late ? { late: true } : {}) };
}

/** Keyed by level id (and by `daily-YYYY-MM-DD` for the daily coop). */
export type Progress = Record<string, Cleared>;

const SETTINGS_KEY = "down-the-hatch:settings:v1";
const PROGRESS_KEY = "down-the-hatch:progress:v2";
/** Before levels had ids, progress was a plain `{ level name: moves }`. */
const OLD_PROGRESS_KEY = "down-the-hatch:progress:v1";

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: carry on without saving */
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isMoves = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v > 0 && v < 100_000;
const isId = (v: string) => /^[a-z0-9-]{1,60}$/.test(v);

export function loadSettings(): Settings {
  const saved = read(SETTINGS_KEY);
  const s: Settings = { sound: true, clock: false, theme: "system", bigText: false, board: "barn", hat: "none", ...(isObject(saved) ? (saved as Partial<Settings>) : {}) };
  if (s.theme !== "light" && s.theme !== "dark") s.theme = "system";
  return s;
}
export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);

/** Keep only what is well-formed. Saved data can be old, hand-edited or pasted in from anywhere. */
function tidy(raw: unknown): Progress {
  const out: Progress = {};
  if (!isObject(raw)) return out;
  for (const [id, v] of Object.entries(raw)) {
    if (!isId(id) || !isObject(v) || !isMoves(v.moves)) continue;
    out[id] = record(v.moves, v.solo === true, v.clock === true, v.late === true);
  }
  return out;
}

/**
 * Read saved progress. `idOfName` maps each level's name to its id, for carrying over progress
 * saved before levels had ids.
 */
export function loadProgress(idOfName: Record<string, string>): Progress {
  const saved = read(PROGRESS_KEY);
  if (saved) return tidy(saved);
  const old = read(OLD_PROGRESS_KEY);
  const carried: Progress = {};
  if (isObject(old)) {
    for (const [name, moves] of Object.entries(old)) {
      const id = idOfName[name];
      if (id && isMoves(moves)) carried[id] = { moves };
    }
  }
  return carried;
}
export const saveProgress = (p: Progress) => write(PROGRESS_KEY, p);

/** The better of two records for the same level: fewest moves, solo or on the clock if either was, late only if both were. */
export function better(a: Cleared | undefined, b: Cleared): Cleared {
  if (!a) return record(b.moves, b.solo, b.clock, b.late);
  return record(Math.min(a.moves, b.moves), a.solo || b.solo, a.clock || b.clock, a.late && b.late);
}

/** Combine two sets of progress, keeping the better record for every level. Neither loses anything. */
export function mergeProgress(mine: Progress, theirs: Progress): Progress {
  const out: Progress = { ...mine };
  for (const [id, record] of Object.entries(theirs)) out[id] = better(out[id], record);
  return out;
}

// ── Backup codes ──
// Progress as one line of text that can be copied out of one browser and pasted into another.
// "DTH1." then base64url of a compact JSON object: { id: moves }, or { id: [moves, flags] } when
// any flag is set: 1 solo, 2 late, 4 on the clock. Older codes only ever used [moves, 1].

const CODE_PREFIX = "DTH1.";

export function encodeProgress(progress: Progress): string {
  const compact: Record<string, number | [number, number]> = {};
  for (const [id, r] of Object.entries(progress)) {
    const flags = (r.solo ? 1 : 0) | (r.late ? 2 : 0) | (r.clock ? 4 : 0);
    compact[id] = flags ? [r.moves, flags] : r.moves;
  }
  return CODE_PREFIX + btoa(JSON.stringify(compact)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Read a backup code. Returns null when the text is not one. */
export function decodeProgress(code: string): Progress | null {
  const text = code.replace(/\s+/g, "");
  if (!text.startsWith(CODE_PREFIX)) return null;
  try {
    const compact: unknown = JSON.parse(atob(text.slice(CODE_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/")));
    if (!isObject(compact)) return null;
    const out: Progress = {};
    for (const [id, v] of Object.entries(compact)) {
      const moves = Array.isArray(v) ? v[0] : v;
      if (!isId(id) || !isMoves(moves)) return null;
      const flags = Array.isArray(v) && Number.isInteger(v[1]) ? (v[1] as number) : 0;
      out[id] = record(moves, (flags & 1) !== 0, (flags & 4) !== 0, (flags & 2) !== 0);
    }
    return out;
  } catch {
    return null;
  }
}

// ── A level in progress ──
// The board a player left mid-level, so that leaving (or the phone closing the tab) doesn't
// throw away a long attempt. Kept as the slides that led there, not the board itself: they are
// replayed through the rules on the way back in, so a level that has since changed simply
// starts afresh instead of showing a board that can't exist.

const IN_PLAY_KEY = "down-the-hatch:in-play:v1";
/** How many unfinished levels are remembered; the oldest is forgotten first. */
const IN_PLAY_MAX = 8;

export interface InPlay {
  /** Every slide from the start to the board as it was left: [hatch id, 0 up, 1 down, 2 left, 3 right]. */
  log: [number, number][];
  /** Where each undo would go back to: a length of `log`. */
  marks: number[];
  /** Eggs whose chicken has been seen. */
  seen: number[];
  /** A hint was taken on this attempt. */
  hinted: boolean;
  /** Seconds left on the clock, when racing it. */
  seconds?: number;
  /** When it was saved (ms), to forget the oldest. */
  at: number;
}

const isPair = (v: unknown): v is [number, number] => Array.isArray(v) && v.length === 2 && Number.isInteger(v[0]) && Number.isInteger(v[1]) && v[1] >= 0 && v[1] < 4;
const isInts = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => Number.isInteger(n) && n >= 0);

export function loadInPlay(id: string): InPlay | null {
  const all = read(IN_PLAY_KEY);
  const v = isObject(all) ? all[id] : null;
  if (!isObject(v) || !Array.isArray(v.log) || !v.log.every(isPair) || !isInts(v.marks) || !isInts(v.seen)) return null;
  return { log: v.log, marks: v.marks, seen: v.seen, hinted: v.hinted === true, at: typeof v.at === "number" ? v.at : 0, ...(typeof v.seconds === "number" ? { seconds: v.seconds } : {}) };
}

/** Remember this level's board, or forget it (null) once it is cleared or back at the start. */
export function saveInPlay(id: string, game: InPlay | null) {
  const saved = read(IN_PLAY_KEY);
  const all: Record<string, unknown> = isObject(saved) ? { ...saved } : {};
  if (game) all[id] = game;
  else delete all[id];
  const ids = Object.keys(all).sort((a, b) => (((all[b] as InPlay)?.at ?? 0) - ((all[a] as InPlay)?.at ?? 0)));
  for (const old of ids.slice(IN_PLAY_MAX)) delete all[old];
  write(IN_PLAY_KEY, all);
}

/** The ids of levels left part-way through. */
export function inPlayIds(): Set<string> {
  const all = read(IN_PLAY_KEY);
  return new Set(isObject(all) ? Object.keys(all) : []);
}
