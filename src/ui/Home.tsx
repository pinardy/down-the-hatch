import { useEffect, useRef, useState } from "react";
import type { Playing } from "../App";
import { dailyStreak } from "../game/daily";
import { eggsFor } from "../game/engine";
import type { Chapter } from "../game/levels";
import type { Level } from "../game/types";
import { unlockAudio } from "../sfx";
import { useUpdateReady } from "../update";
import { EggArt, SoloArt, TitleArt } from "./art";
import { Guide } from "./Guide";
import { decodeProgress, encodeProgress, mergeProgress } from "./storage";
import type { Progress, Settings } from "./storage";

interface Props {
  chapters: Chapter[];
  /** Today's daily coop. */
  daily: Level;
  progress: Progress;
  settings: Settings;
  /** The level just played, if any: its chapter starts open. */
  lastPlayed: Playing;
  onPlay: (which: number | "daily") => void;
  onSettings: (s: Settings) => void;
  /** Replace all saved progress (after restoring a backup, or erasing). */
  onProgress: (p: Progress) => void;
}

export function Home({ chapters, daily, progress, settings, lastPlayed, onPlay, onSettings, onProgress }: Props) {
  const levels = chapters.flatMap((c) => c.levels);
  const eggsOn = (l: Level) => (progress[l.id] ? eggsFor(progress[l.id].moves, l.par) : 0);
  const next = levels.find((l) => !progress[l.id]);
  const nextIn = next && chapters.find((c) => c.levels.includes(next))!;
  const cleared = levels.filter((l) => progress[l.id]).length;
  const eggs = levels.reduce((n, l) => n + eggsOn(l), 0);
  // Chapters fold away so the whole list fits on a screen. The one you are working on,
  // and the one you just came back from, start open.
  const [open, setOpen] = useState<ReadonlySet<string>>(() => {
    const names = chapters.filter((c) => c.levels.some((l) => l === next || l.index === lastPlayed)).map((c) => c.name);
    return new Set(names.length ? names : [chapters[0].name]);
  });
  const toggle = (name: string) =>
    setOpen((was) => {
      const now = new Set(was);
      if (!now.delete(name)) now.add(name);
      return now;
    });
  // Coming back from a level, put it back in view: the list is long and the top is a long way up.
  const cameFrom = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // Braces matter: some browsers return a promise from scrollIntoView, and an effect must not return one.
    cameFrom.current?.scrollIntoView({ block: "center" });
  }, []);
  // The big welcome is for the first visit. After that the list matters more.
  const returning = cleared > 0;
  const play = (which: number | "daily") => {
    unlockAudio();
    onPlay(which);
  };

  const dailyBest = progress[daily.id];
  const streak = dailyStreak((id) => progress[id] !== undefined, new Date());
  const updateReady = useUpdateReady();
  const [guide, setGuide] = useState(false);

  return (
    <main className="screen home">
      <header className={returning ? "home__hero home__hero--compact" : "home__hero"}>
        {!returning && <TitleArt />}
        <h1 className="home__title">
          Down the{returning ? " " : <br />}Hatch
        </h1>
        {!returning && <p className="home__pitch">Slide a hatch under chickens of its own colour and down they go. Clear the coop.</p>}
        <button type="button" className="btn btn--straw btn--big" onClick={() => play(next ? next.index : 0)}>
          {next && nextIn ? (cleared === 0 ? "Start playing" : `Play ${nextIn.name} ${nextIn.levels.indexOf(next) + 1}`) : "Play from the start"}
        </button>
        <p className="home__tally">
          {cleared} of {levels.length} levels cleared, {eggs} of {levels.length * 3} eggs
        </p>
      </header>

      <button type="button" className={dailyBest ? "daily daily--done" : "daily"} onClick={() => play("daily")}>
        <span className="daily__text">
          <span className="daily__title">
            Daily coop
            <span className="daily__date">{daily.name}</span>
          </span>
          <span className="daily__about">
            {dailyBest ? (
              <>
                Cleared in {dailyBest.moves} {dailyBest.moves === 1 ? "move" : "moves"}
                <span className="level__eggs" role="img" aria-label={`${eggsOn(daily)} of 3 eggs`}>
                  {[1, 2, 3].map((n) => (
                    <EggArt key={n} earned={n <= eggsOn(daily)} />
                  ))}
                </span>
              </>
            ) : (
              `A new board every day. Par ${daily.par}.`
            )}
          </span>
          {streak > 1 && <span className="daily__streak">{streak} days in a row</span>}
        </span>
        <span className="daily__go">{dailyBest ? "Again" : "Play"}</span>
      </button>

      <div className="chapters">
        {chapters.map((chapter, c) => {
          const done = chapter.levels.filter((l) => progress[l.id]).length;
          const all = done === chapter.levels.length;
          const won = chapter.levels.reduce((n, l) => n + eggsOn(l), 0);
          const isOpen = open.has(chapter.name);
          return (
            // A finished chapter folds down to a thin row, so the list is mostly what is left to play.
            <section key={chapter.name} className={all ? "chapter chapter--done" : "chapter"}>
              <h2>
                <button type="button" className="chapter__toggle" aria-expanded={isOpen} aria-controls={`chapter-${c}`} onClick={() => toggle(chapter.name)}>
                  <span className="chapter__head">
                    <span className="chapter__title">
                      {chapter.name}
                      <span className={`grade grade--${chapter.difficulty.toLowerCase()}`}>{chapter.difficulty}</span>
                    </span>
                    <span className="chapter__tally">
                      {all ? (
                        <span className="chapter__check" aria-label={`All ${chapter.levels.length} cleared`}>
                          ✓
                        </span>
                      ) : (
                        <span>
                          {done} of {chapter.levels.length} cleared
                        </span>
                      )}
                      <span className="chapter__eggs">
                        <EggArt earned={won > 0} />
                        {won} of {chapter.levels.length * 3} eggs
                      </span>
                    </span>
                  </span>
                  <svg className="chapter__chevron" viewBox="0 0 16 16" aria-hidden="true">
                    <path d="M3 6 l5 5 l5 -5" />
                  </svg>
                </button>
              </h2>
              {isOpen && (
                <div id={`chapter-${c}`} className="chapter__body">
                  <p className="chapter__blurb">{chapter.blurb}</p>
                  <ol className="level-grid">
                    {chapter.levels.map((l, i) => {
                      const best = progress[l.id];
                      const earned = eggsOn(l);
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            ref={l.index === lastPlayed ? cameFrom : undefined}
                            className={best ? "level level--done" : l === next ? "level level--next" : "level"}
                            onClick={() => play(l.index)}
                            aria-label={`${chapter.name} ${i + 1}, ${l.name}${best ? `, cleared with ${earned} of 3 eggs${best.solo ? ", without hints" : ""}` : ""}`}
                          >
                            {best?.solo && <SoloArt />}
                            <span className="level__number">{i + 1}</span>
                            <span className="level__name">{l.name}</span>
                            <span className="level__eggs" aria-hidden="true">
                              {[1, 2, 3].map((n) => (
                                <EggArt key={n} earned={n <= earned} />
                              ))}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                </div>
              )}
            </section>
          );
        })}
      </div>

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
            <small>A countdown on every level. Off, there’s no rush.</small>
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
        <button type="button" className="btn btn--quiet home__guide" onClick={() => setGuide(true)}>
          What the pieces do
        </button>
      </section>

      {guide && <Guide level={null} onClose={() => setGuide(false)} />}

      <Keeping progress={progress} onProgress={onProgress} />

      {updateReady && (
        <div className="update" role="status">
          <span>A new version is ready.</span>
          <button type="button" className="btn btn--straw" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      )}
    </main>
  );
}

/**
 * Looking after saved progress. It lives in this browser and nowhere else, so there is a way
 * to carry it out as a line of text, a way to bring one back in, and a way to wipe the slate.
 */
function Keeping({ progress, onProgress }: { progress: Progress; onProgress: (p: Progress) => void }) {
  const [panel, setPanel] = useState<"code" | "restore" | "reset" | null>(null);
  const [said, setSaid] = useState<{ text: string; warn?: boolean } | null>(null);
  const [pasted, setPasted] = useState("");
  const count = Object.keys(progress).length;
  const code = panel === "code" ? encodeProgress(progress) : "";

  const show = (which: typeof panel) => {
    setPanel(which);
    setSaid(null);
  };

  const backUp = async () => {
    show("code");
    try {
      await navigator.clipboard.writeText(encodeProgress(progress));
      setSaid({ text: "Copied. Paste it somewhere safe, like a note or a message to yourself." });
    } catch {
      setSaid({ text: "Copy the code below and keep it somewhere safe." });
    }
  };

  const restore = () => {
    const theirs = decodeProgress(pasted);
    if (!theirs) return setSaid({ text: "That isn’t a backup code. Check that all of it was copied.", warn: true });
    // Merging keeps the better record for every level, so restoring can never lose progress.
    const merged = mergeProgress(progress, theirs);
    onProgress(merged);
    setPasted("");
    setPanel(null);
    setSaid({ text: `Restored. ${Object.keys(merged).length} cleared coops are saved here now.` });
  };

  const erase = () => {
    onProgress({});
    setPanel(null);
    setSaid({ text: "Progress erased." });
  };

  return (
    <section className="keeping" aria-labelledby="keeping-title">
      <h2 id="keeping-title">Your progress</h2>
      <p className="keeping__about">Saved in this browser only. A backup code carries it to another phone or browser.</p>
      <div className="keeping__actions">
        <button type="button" className="btn" onClick={backUp} disabled={count === 0}>
          Copy backup code
        </button>
        <button type="button" className="btn" onClick={() => show(panel === "restore" ? null : "restore")} aria-expanded={panel === "restore"}>
          Restore from a code
        </button>
        <button type="button" className="btn btn--quiet" onClick={() => show(panel === "reset" ? null : "reset")} disabled={count === 0} aria-expanded={panel === "reset"}>
          Reset progress
        </button>
      </div>

      {panel === "code" && <textarea className="keeping__code" readOnly rows={4} value={code} aria-label="Backup code" onFocus={(e) => e.currentTarget.select()} />}

      {panel === "restore" && (
        <form
          className="keeping__panel"
          onSubmit={(e) => {
            e.preventDefault();
            restore();
          }}
        >
          <textarea className="keeping__code" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Paste a backup code here" aria-label="Backup code to restore" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
          <button type="submit" className="btn btn--straw" disabled={!pasted.trim()}>
            Restore
          </button>
        </form>
      )}

      {panel === "reset" && (
        <div className="keeping__panel">
          <p>
            Erase all {count} cleared {count === 1 ? "coop" : "coops"} and their eggs? This can’t be undone.
          </p>
          <div className="keeping__actions">
            <button type="button" className="btn btn--warn" onClick={erase}>
              Erase everything
            </button>
            <button type="button" className="btn" onClick={() => show(null)}>
              Keep my progress
            </button>
          </div>
        </div>
      )}

      <p className={said?.warn ? "keeping__said keeping__said--warn" : "keeping__said"} role="status">
        {said?.text}
      </p>
    </section>
  );
}
