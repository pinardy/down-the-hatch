// The weekly gauntlet on the Daily tab: what it is, how this week's run stands, and the way in.
import { useState } from "react";
import { GAUNTLET_BOARDS, movesLeft, resultOf, runOver, shareText } from "../game/gauntlet";
import type { Level } from "../game/types";
import type { GauntletSave } from "./storage";

export interface GauntletProps {
  save: GauntletSave;
  budget: number;
  /** A day in this week. */
  week: Date;
  boards: Level[];
  /** Play: go on with the run, or (`fresh`) start a new one. */
  onStart: (fresh: boolean) => void;
}

export function GauntletCard({ save, budget, week, boards, onStart }: GauntletProps) {
  const [said, setSaid] = useState<string | null>(null);
  const run = save.run;
  const going = run && !runOver(run);
  const over = run && runOver(run);
  const best = save.best;
  const monday = week.toLocaleDateString(undefined, { weekday: "long" });

  const share = async () => {
    if (!best) return;
    const text = shareText(best, budget, week, location.origin + location.pathname);
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setSaid("Copied. Paste it anywhere.");
    } catch {
      setSaid(text);
    }
  };

  return (
    <section className="gauntlet" aria-labelledby="gauntlet-title">
      <h2 id="gauntlet-title" className="gauntlet__title">
        Weekly gauntlet
      </h2>
      <p className="gauntlet__about">
        {GAUNTLET_BOARDS} boards in a row, one budget of {budget} moves for all of them. Undo and Start over are free on a board, but go over the budget and the run is done. The same for everyone, new each {monday}.
      </p>
      <ol className="gauntlet__boards" aria-label="This week's boards">
        {boards.map((b, i) => {
          const done = run && i < run.moves.length;
          const now = going && i === run.moves.length;
          return (
            <li key={b.id} className={done ? "gauntlet__board gauntlet__board--done" : now ? "gauntlet__board gauntlet__board--now" : "gauntlet__board"}>
              <span className="gauntlet__n">{i + 1}</span>
              <span className="gauntlet__par">{done ? `${run.moves[i]} moves` : `par ${b.par}`}</span>
            </li>
          );
        })}
      </ol>
      {going && run && (
        <p className="gauntlet__status">
          Board {run.moves.length + 1} next, with {movesLeft(run, budget)} moves left.
        </p>
      )}
      {over && run && (
        <p className="gauntlet__status">
          {run.out ? `Out of moves after ${resultOf(run).cleared} of ${GAUNTLET_BOARDS} boards.` : `All ${GAUNTLET_BOARDS} boards in ${resultOf(run).moves} of ${budget} moves.`}
        </p>
      )}
      {best && (
        <p className="gauntlet__best">
          Best this week: {best.cleared === GAUNTLET_BOARDS ? `all ${GAUNTLET_BOARDS} in ${best.moves} moves` : `${best.cleared} of ${GAUNTLET_BOARDS} boards`}.
        </p>
      )}
      <div className="keeping__actions">
        <button type="button" className="btn btn--straw" onClick={() => onStart(!going)}>
          {going ? "Go on" : over ? "Try again" : "Start"}
        </button>
        {going && (
          <button type="button" className="btn btn--quiet" onClick={() => onStart(true)}>
            Start again
          </button>
        )}
        {best && (
          <button type="button" className="btn" onClick={share}>
            Share best
          </button>
        )}
      </div>
      {said && (
        <p className="gauntlet__said" role="status">
          {said}
        </p>
      )}
    </section>
  );
}
