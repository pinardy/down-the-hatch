// The weekly gauntlet: five boards in a row on one budget of moves, the same for everyone that
// week. Drawn from the daily pool, one board from each of five of its bands, gentlest first,
// and never the board that band gives a daily coop the same week.

import { BANDS, dayKey } from "./daily";
import { parseLevel } from "./engine";
import type { Level } from "./types";

export const GAUNTLET_BOARDS = 5;
/** `Level.index` for gauntlet boards, which are not numbered levels. */
export const GAUNTLET_INDEX = -4;
/** Moves to spare, over the boards' pars added up. */
export const GAUNTLET_SPARE = 5;
/** The daily pool's bands the boards come from, gentlest first. */
const FROM = [0, 2, 3, 5, 6];

/** The Monday that starts the week `date` is in, at noon. */
export function weekStart(date: Date): Date {
  const back = (date.getDay() + 6) % 7; // days since Monday
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - back, 12);
}
/** The week, as its Monday: YYYY-MM-DD. */
export const weekKey = (date: Date) => dayKey(weekStart(date));
/** Whole weeks since the Monday 5 January 1970. */
const weekNumber = (date: Date) => {
  const monday = weekStart(date);
  return Math.round((Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()) - Date.UTC(1970, 0, 5)) / (7 * 86_400_000));
};

/** This week's five boards. */
export function gauntletLevels(date: Date): Level[] {
  const week = weekNumber(date);
  const key = weekKey(date);
  return FROM.map((b, i) => {
    const band = BANDS[b];
    // The daily coop takes this band's board at `week`: three on from it is a different one.
    const def = band[(week + 3) % band.length];
    return parseLevel({ ...def, id: `gauntlet-${key}-${i + 1}`, name: `Board ${i + 1}` }, GAUNTLET_INDEX, "Weekly gauntlet");
  });
}

/** Moves for the whole run. */
export const gauntletBudget = (levels: Level[]) => levels.reduce((n, l) => n + l.par, 0) + GAUNTLET_SPARE;

/** A run: the moves each board cleared so far took, in order, and whether it ran out of moves. */
export interface GauntletRun {
  moves: number[];
  out?: boolean;
}
/** How a run went: boards cleared, and the moves they took. */
export interface GauntletResult {
  cleared: number;
  moves: number;
}
export const resultOf = (run: GauntletRun): GauntletResult => ({ cleared: run.moves.length, moves: run.moves.reduce((a, b) => a + b, 0) });
/** More boards beats fewer; then fewer moves. */
export const betterResult = (a: GauntletResult, b: GauntletResult | null | undefined) => !b || a.cleared > b.cleared || (a.cleared === b.cleared && a.moves < b.moves);
/** Moves still to spend in a run. */
export const movesLeft = (run: GauntletRun, budget: number) => budget - resultOf(run).moves;
/** The run is over: every board cleared, or out of moves. */
export const runOver = (run: GauntletRun) => !!run.out || run.moves.length >= GAUNTLET_BOARDS;

/** The result as text to send to someone, without giving the boards away. */
export function shareText(result: GauntletResult, budget: number, week: Date, link: string): string {
  const when = weekStart(week).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  const boxes = Array.from({ length: GAUNTLET_BOARDS }, (_, i) => (i < result.cleared ? "🟩" : "⬜")).join("");
  const how = result.cleared === GAUNTLET_BOARDS ? `all ${GAUNTLET_BOARDS} boards in ${result.moves} of ${budget} moves` : `${result.cleared} of ${GAUNTLET_BOARDS} boards before the moves ran out`;
  return `Down the Hatch, weekly gauntlet from ${when}\n${boxes} ${how}\n${link}`;
}
