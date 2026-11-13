// Settings and rewards, in one sheet that opens over any screen: from the level list, or
// mid-level without losing the board.

import { useEffect, useRef } from "react";
import type { ReactElement } from "react";
import { ChickenArt, DayArt, EggArt, SoloArt } from "./art";
import { CURRENCY, isUnlocked, nextReward, REWARDS, rewardName, wearing } from "./rewards";
import type { BoardTheme, Currency, Hat, Reward, Tally } from "./rewards";
import type { Settings } from "./storage";

const COST_ART: Record<Currency, () => ReactElement> = {
  eggs: () => <EggArt earned={false} />,
  stars: () => <SoloArt />,
  days: () => <DayArt />,
};

/** "46 more eggs for the Snowfall board." for each currency with something left to earn. */
export function rewardsAhead(tally: Tally): string[] {
  return (["eggs", "stars", "days"] as const).flatMap((by) => {
    const next = nextReward(by, tally);
    if (!next) return [];
    const left = next.need - tally[by];
    return [`${left} more ${left === 1 ? CURRENCY[by].one : CURRENCY[by].many} for the ${rewardName(next)}.`];
  });
}

export function SettingsSheet({ settings, tally, onSettings, onClose }: { settings: Settings; tally: Tally; onSettings: (s: Settings) => void; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    // Focus the way out without scrolling to it: the sheet should open at the top.
    closeRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet__card settings">
        <h2 id="settings-title">Settings</h2>
        <section className="home__settings" aria-label="Settings">
          <label className="toggle">
            <input type="checkbox" checked={settings.sound} onChange={(e) => onSettings({ ...settings, sound: e.target.checked })} />
            <span>
              Sound
              <small>Clucks, thunks and a fanfare.</small>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.clock} onChange={(e) => onSettings({ ...settings, clock: e.target.checked })} />
            <span>
              Race the clock
              <small>A countdown on every level. Beat it for a clock badge. Off, there’s no rush.</small>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.hard} onChange={(e) => onSettings({ ...settings, hard: e.target.checked })} />
            <span>
              Hard mode
              <small>No undo, no hints, no rewind. Only starting over. Clears earn a flame.</small>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.contrast} onChange={(e) => onSettings({ ...settings, contrast: e.target.checked })} />
            <span>
              High contrast
              <small>Bolder outlines and marks, so pieces stand apart.</small>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.calm} onChange={(e) => onSettings({ ...settings, calm: e.target.checked })} />
            <span>
              Reduce motion
              <small>Fewer and shorter animations.</small>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.vibrate} onChange={(e) => onSettings({ ...settings, vibrate: e.target.checked })} />
            <span>
              Vibration
              <small>A short buzz when chickens drop, on phones that can.</small>
            </span>
          </label>
          <label className="toggle">
            <input type="checkbox" checked={settings.bigText} onChange={(e) => onSettings({ ...settings, bigText: e.target.checked })} />
            <span>
              Larger text
              <small>Everything but the board, a size up.</small>
            </span>
          </label>
          <fieldset className="toggle choice">
            <legend>Look</legend>
            <div className="choice__options">
              {(
                [
                  ["system", "Match device"],
                  ["light", "Daylight"],
                  ["dark", "Lamplight"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className={settings.theme === value ? "choice__option choice__option--on" : "choice__option"}>
                  <input type="radio" name="theme" value={value} checked={settings.theme === value} onChange={() => onSettings({ ...settings, theme: value })} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <Rewards tally={tally} settings={settings} onSettings={onSettings} />
        <button type="button" ref={closeRef} className="btn btn--straw btn--big settings__close" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

/** What eggs, stars and daily coops buy: board themes and hats. Locked ones show what they need. */
function Rewards({ tally, settings, onSettings }: { tally: Tally; settings: Settings; onSettings: (s: Settings) => void }) {
  const board = wearing("board", settings.board, tally, "barn");
  const hat = wearing("hat", settings.hat, tally, "none");
  const option = (r: Reward) => {
    const open = isUnlocked(r, tally);
    const on = r.kind === "board" ? board === r.id : hat === r.id;
    const Cost = COST_ART[r.by];
    return (
      <button
        key={r.id}
        type="button"
        className={on ? "reward reward--on" : open ? "reward" : "reward reward--locked"}
        disabled={!open}
        aria-pressed={on}
        aria-label={open ? r.name : `${r.name}, unlocks at ${r.need} ${CURRENCY[r.by].many}`}
        onClick={() => onSettings(r.kind === "board" ? { ...settings, board: r.id as BoardTheme } : { ...settings, hat: r.id as Hat })}
      >
        <span className={r.kind === "board" ? `reward__swatch swatch--${r.id}` : "reward__swatch swatch--barn"}>{r.kind === "hat" && <ChickenArt color="gold" hat={r.id as Hat} />}</span>
        <span className="reward__name">{r.name}</span>
        {!open && (
          <span className="reward__cost">
            <Cost /> {r.need}
          </span>
        )}
      </button>
    );
  };
  const ahead = rewardsAhead(tally);
  return (
    <section className="rewards" aria-labelledby="rewards-title">
      <h2 id="rewards-title">Rewards</h2>
      <p className="keeping__about">
        {tally.eggs} {tally.eggs === 1 ? "egg" : "eggs"}, {tally.stars} {tally.stars === 1 ? "star" : "stars"} and {tally.days} {tally.days === 1 ? "daily coop" : "daily coops"} so far. {ahead.length ? ahead.join(" ") : "Everything unlocked."}
      </p>
      <h3 className="rewards__kind">Board</h3>
      <div className="rewards__grid">{REWARDS.filter((r) => r.kind === "board").map(option)}</div>
      <h3 className="rewards__kind">Hat</h3>
      <div className="rewards__grid">{REWARDS.filter((r) => r.kind === "hat").map(option)}</div>
    </section>
  );
}
