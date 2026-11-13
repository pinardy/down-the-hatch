// Home-made levels, written as one line of text so they can be sent to anyone: "DTHL1." then
// base64url of { n: name, r: rows, h: hatches, p: par }. The same text works on its own or at
// the end of a link to the game, after "#play=".

import { parseLevel } from "./engine";
import type { Level, LevelDef } from "./types";

const PREFIX = "DTHL1.";
/** Big enough for a real puzzle, small enough for the solver to check on a phone. */
export const LIMITS = { minW: 3, maxW: 8, minH: 2, maxH: 8, hatches: 10, chickens: 40 } as const;

export type SharedLevel = Pick<LevelDef, "name" | "rows" | "hatches" | "par">;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string): string {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeLevel(level: SharedLevel): string {
  return PREFIX + toBase64Url(JSON.stringify({ n: level.name, r: level.rows, h: level.hatches, p: level.par }));
}

/** The level code inside `text`: a bare code, or a link with "#play=" on the end. */
export function findCode(text: string): string | null {
  const m = text.replace(/\s+/g, "").match(/DTHL1\.[A-Za-z0-9_-]+/);
  return m ? m[0] : null;
}

/** A playable level from a code, or null if the code is damaged or the level is not fair. */
export function decodeLevel(text: string): Level | null {
  const code = findCode(text);
  if (!code) return null;
  try {
    const raw = JSON.parse(fromBase64Url(code.slice(PREFIX.length))) as { n?: unknown; r?: unknown; h?: unknown; p?: unknown };
    if (!Array.isArray(raw.r) || !Array.isArray(raw.h) || typeof raw.p !== "number" || !Number.isInteger(raw.p) || raw.p < 1 || raw.p > 200) return null;
    const rows = raw.r as string[];
    if (!rows.every((r) => typeof r === "string")) return null;
    if (rows.length < LIMITS.minH || rows.length > LIMITS.maxH || rows[0].length < LIMITS.minW || rows[0].length > LIMITS.maxW) return null;
    if (raw.h.length < 1 || raw.h.length > LIMITS.hatches) return null;
    const name = typeof raw.n === "string" && raw.n.trim() ? raw.n.trim().slice(0, 40) : "A coop from a friend";
    // parseLevel checks everything else: squares, hatch places, colours adding up.
    const level = parseLevel({ id: "shared", name, rows, hatches: raw.h as LevelDef["hatches"], par: raw.p }, -2, "Shared coop");
    return level.chickens.length <= LIMITS.chickens ? level : null;
  } catch {
    return null;
  }
}
