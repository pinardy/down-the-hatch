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
    out[id] = v.solo === true ? { moves: v.moves, solo: true } : { moves: v.moves };
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

/** The better of two records for the same level: fewest moves, and solo if either was. */
export function better(a: Cleared | undefined, b: Cleared): Cleared {
  if (!a) return b;
  const moves = Math.min(a.moves, b.moves);
  return a.solo || b.solo ? { moves, solo: true } : { moves };
}

/** Combine two sets of progress, keeping the better record for every level. Neither loses anything. */
export function mergeProgress(mine: Progress, theirs: Progress): Progress {
  const out: Progress = { ...mine };
  for (const [id, record] of Object.entries(theirs)) out[id] = better(out[id], record);
  return out;
}

// ── Backup codes ──
// Progress as one line of text that can be copied out of one browser and pasted into another.
// "DTH1." then base64url of a compact JSON object: { id: moves } or { id: [moves, 1] } when solo.

const CODE_PREFIX = "DTH1.";

export function encodeProgress(progress: Progress): string {
  const compact: Record<string, number | [number, 1]> = {};
  for (const [id, r] of Object.entries(progress)) compact[id] = r.solo ? [r.moves, 1] : r.moves;
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
      out[id] = Array.isArray(v) && v[1] === 1 ? { moves, solo: true } : { moves };
    }
    return out;
  } catch {
    return null;
  }
}
