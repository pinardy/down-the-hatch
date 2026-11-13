// The daily coop: one extra board a day, the same for everyone, drawn from a pool that ships
// with the game. Nothing is fetched, so it works offline like the rest.
//
// The week has a shape: Monday's board is the gentlest and each day is a little harder, up
// to Sunday's. The pool is sorted by par and cut into seven bands, one per weekday, and each
// weekday works through its own band, a board a week, before starting it again.
//
// The pool is grown by `npm run levels` like any other level (see docs/levels.md). Adding
// boards moves the bands, so which board falls on which day changes from then on.

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

/** The pool cut into seven bands by par: BANDS[0] is Monday's, the easiest; BANDS[6] is Sunday's. */
const BANDS = (() => {
  const byPar = [...DAILY_POOL].sort((a, b) => a.par - b.par); // stable, so equal pars keep their pool order
  return Array.from({ length: 7 }, (_, d) => byPar.slice(Math.floor((d * byPar.length) / 7), Math.floor(((d + 1) * byPar.length) / 7)));
})();

export function dailyLevel(date: Date): Level {
  // 1 January 1970 was a Thursday; count weekdays from Monday = 0 and weeks from a Monday.
  const day = dayNumber(date) + 3;
  const band = BANDS[day % 7];
  const def = band[Math.floor(day / 7) % band.length];
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
