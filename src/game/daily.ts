// The daily coop: one extra board a day, the same for everyone, drawn in turn from a pool
// that ships with the game. Nothing is fetched, so it works offline like the rest.
//
// The pool is grown by `npm run levels` like any other level (see docs/levels.md). Add to the
// END of it: a board's place in the pool decides which day it falls on, so adding at the end
// leaves the days already played alone until the pool next comes round.

import { parseLevel } from "./engine";
import { DAILY_POOL } from "./daily-pool";
import type { Level } from "./types";

/** `Level.index` for the daily coop, which is not one of the numbered levels. */
export const DAILY_INDEX = -1;

const pad = (n: number) => String(n).padStart(2, "0");

/** The calendar day where the player is, as YYYY-MM-DD. The daily coop turns over at their midnight. */
export const dayKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/** What a cleared daily coop is filed under in saved progress. */
export const dailyId = (date: Date) => `daily-${dayKey(date)}`;

/** Whole days since 1 January 1970, counted on the player's own calendar. */
const dayNumber = (date: Date) => Math.round(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);

/** `days` before `date`, at noon so that a clock change cannot land on the wrong day. */
const daysBefore = (date: Date, days: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() - days, 12);

export function dailyLevel(date: Date): Level {
  const def = DAILY_POOL[dayNumber(date) % DAILY_POOL.length];
  const name = date.toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return parseLevel({ ...def, id: dailyId(date), name }, DAILY_INDEX, "Daily coop");
}

/**
 * How many days in a row the daily coop has been cleared, ending today, or ending yesterday
 * if today's is still to play (a streak is not lost until the day is over).
 */
export function dailyStreak(cleared: (id: string) => boolean, today: Date): number {
  let from = cleared(dailyId(today)) ? 0 : 1;
  let run = 0;
  while (cleared(dailyId(daysBefore(today, from)))) {
    run++;
    from++;
  }
  return run;
}
