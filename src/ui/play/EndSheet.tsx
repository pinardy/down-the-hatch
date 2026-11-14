// The sheet that ends a level: cleared (eggs, badges, milestones, rewards, what next), the best
// solution having been shown, or time up.

import { useState } from "react";
import type { CSSProperties } from "react";
import { msUntilTomorrow, untilText } from "../../game/daily";
import type { GameState, Level } from "../../game/types";
import { ClockArt, EggArt, HardArt, SoloArt } from "../art";
import { rewardName } from "../rewards";
import type { Reward, Tally } from "../rewards";
import type { Cleared, Settings } from "../storage";
import { EGG_LAND_MS } from "./model";

interface Props {
  phase: "won" | "shown" | "timeup";
  level: Level;
  game: GameState;
  /** Eggs this run earned, and the most moves that still earn two. */
  eggs: number;
  limit: number;
  best: Cleared | undefined;
  /** Badges this win earned. */
  wonSolo: boolean;
  wonClock: boolean;
  wonHard: boolean;
  /** What this win finished, as it stood when the level opened. */
  milestone: { chapter: { name: string; levels: number } | null; game: { levels: number } | null };
  tally: Tally;
  /** Rewards this win unlocked. */
  unlocked: Reward[];
  settings: Settings;
  daily: boolean;
  late: boolean;
  shareLink?: string;
  nextLabel?: string;
  nextChapter: string | null;
  backLabel: string;
  onNext: (() => void) | null;
  onRestart: () => void;
  onWatch: () => void;
  onLevels: () => void;
  onWear: (r: Reward) => void;
}

export function EndSheet({ phase, level, game, eggs, limit, best, wonSolo, wonClock, wonHard, milestone, tally, unlocked, settings, daily, late, shareLink, nextLabel, nextChapter, backLabel, onNext, onRestart: restart, onWatch: watch, onLevels, onWear }: Props) {
  // Sharing a result: no board, no spoilers, just how it went.
  const [shared, setShared] = useState<string | null>(null);
  const share = async () => {
    const result = `${game.moves} ${game.moves === 1 ? "move" : "moves"} (par ${level.par}) ${"🥚".repeat(eggs)}${"⚪".repeat(3 - eggs)}${wonSolo ? " ⭐ no hints" : ""}`;
    const text = shareLink
      ? [`I cleared “${level.name}” in Down the Hatch: ${result}`, `Your turn: ${shareLink}`].join("\n")
      : [`Down the Hatch, daily coop ${level.name}`, result, location.origin + location.pathname].join("\n");
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
      setShared("Copied. Paste it anywhere.");
    } catch {
      setShared(text);
    }
  };

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div className="sheet__card">
        {phase === "won" ? (
          <>
            {(eggs === 3 || milestone.chapter || milestone.game) && (
              <div className="burst" aria-hidden="true">
                {Array.from({ length: 14 }, (_, i) => (
                  <span key={i} style={{ "--a": `${(i * 360) / 14}deg`, "--d": `${(i % 3) * 60}ms` } as CSSProperties} />
                ))}
              </div>
            )}
            <div className="sheet__eggs" role="img" aria-label={`${eggs} of 3 eggs`}>
              {[1, 2, 3].map((n) => (
                <span key={n} className={n <= eggs ? "sheet__egg sheet__egg--earned" : "sheet__egg"} style={{ animationDelay: `${320 + (n - 1) * EGG_LAND_MS}ms` }}>
                  <EggArt earned={n <= eggs} />
                </span>
              ))}
            </div>
            {milestone.game ? (
              <div className="sheet__milestone">
                <p className="sheet__kicker">Every coop cleared!</p>
                <p>
                  That’s all {milestone.game.levels} levels. {tally.eggs} of {milestone.game.levels * 3} eggs and {tally.stars} stars so far. The daily coop is waiting tomorrow, and the level editor whenever you want to set a puzzle of your own.
                </p>
              </div>
            ) : (
              milestone.chapter && (
                <div className="sheet__milestone">
                  <p className="sheet__kicker">Chapter complete!</p>
                  <p>
                    All {milestone.chapter.levels} levels of {milestone.chapter.name} cleared.
                  </p>
                </div>
              )
            )}
            <h2 id="sheet-title">Coop cleared</h2>
            <p>
              {game.moves} {game.moves === 1 ? "move" : "moves"}. {game.moves <= level.par ? "That’s par, the fewest possible." : `Par is ${level.par}.`}
            </p>
            {(wonSolo || wonClock || wonHard) && (
              <p className="sheet__solo">
                {wonHard && (
                  <>
                    <HardArt /> Hard mode.
                  </>
                )}
                {wonSolo && (
                  <>
                    <SoloArt /> No hints used.
                  </>
                )}
                {wonClock && (
                  <>
                    <ClockArt /> Beat the clock.
                  </>
                )}
              </p>
            )}
            {game.moves > level.par && <p className="sheet__more">{eggs === 2 ? "Match par for the third egg." : `${limit} moves or fewer earns two eggs; par earns three.`}</p>}
            {daily && !late && <p className="sheet__more">Next board in {untilText(msUntilTomorrow(new Date()))}.</p>}
            {unlocked.length > 0 && (
              <div className="sheet__reward">
                <p>Unlocked: {unlocked.map(rewardName).join(" and ")}!</p>
                <div className="sheet__wear">
                  {unlocked.map((r) => {
                    const on = r.kind === "board" ? settings.board === r.id : settings.hat === r.id;
                    return (
                      <button key={r.id} type="button" className="btn" onClick={() => onWear(r)} disabled={on}>
                        {on ? `Wearing the ${r.name}` : `Try on the ${r.name}`}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="sheet__actions">
              {onNext && (
                <button type="button" className="btn btn--straw btn--big" onClick={onNext} autoFocus>
                  {nextLabel ?? (nextChapter ? `On to ${nextChapter}` : "Next level")}
                </button>
              )}
              {(daily || shareLink) && (
                <button type="button" className="btn btn--straw btn--big" onClick={share} autoFocus>
                  Share result
                </button>
              )}
              {shared && (
                <p className="sheet__shared" role="status">
                  {shared}
                </p>
              )}
              <button type="button" className="btn" onClick={restart}>
                Play again
              </button>
              {game.moves > level.par && (
                <button type="button" className="btn" onClick={watch}>
                  Watch the best solution
                </button>
              )}
              <button type="button" className="btn btn--quiet" onClick={onLevels}>
                {backLabel}
              </button>
            </div>
          </>
        ) : phase === "shown" ? (
          <>
            <h2 id="sheet-title">That’s par</h2>
            <p>
              {level.par} {level.par === 1 ? "move" : "moves"} is the fewest possible.{best ? ` Your best is ${best.moves}.` : ""} Now try it yourself.
            </p>
            <div className="sheet__actions">
              <button type="button" className="btn btn--straw btn--big" onClick={restart} autoFocus>
                Play again
              </button>
              {onNext && (
                <button type="button" className="btn" onClick={onNext}>
                  Next level
                </button>
              )}
              <button type="button" className="btn btn--quiet" onClick={onLevels}>
                {backLabel}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2 id="sheet-title">Time’s up</h2>
            <p>
              {game.chickens.length} {game.chickens.length === 1 ? "chicken is" : "chickens are"} still up top. The clock restarts with the level.
            </p>
            <div className="sheet__actions">
              <button type="button" className="btn btn--straw btn--big" onClick={restart} autoFocus>
                Try again
              </button>
              <button type="button" className="btn btn--quiet" onClick={onLevels}>
                {backLabel}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
