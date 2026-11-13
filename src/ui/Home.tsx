import { useEffect, useRef, useState } from "react";
import { eggsFor } from "../game/engine";
import type { Chapter } from "../game/levels";
import { unlockAudio } from "../sfx";
import { EggArt, TitleArt } from "./art";
import type { Progress, Settings } from "./storage";

interface Props {
  chapters: Chapter[];
  progress: Progress;
  settings: Settings;
  /** The level just played, if any: its chapter starts open. */
  lastPlayed: number | null;
  onPlay: (index: number) => void;
  onSettings: (s: Settings) => void;
}

export function Home({ chapters, progress, settings, lastPlayed, onPlay, onSettings }: Props) {
  const levels = chapters.flatMap((c) => c.levels);
  const next = levels.find((l) => progress[l.name] === undefined);
  const nextIn = next && chapters.find((c) => c.levels.includes(next))!;
  const cleared = levels.filter((l) => progress[l.name] !== undefined).length;
  const eggs = levels.reduce((n, l) => n + (progress[l.name] !== undefined ? eggsFor(progress[l.name], l.par) : 0), 0);
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
  const play = (index: number) => {
    unlockAudio();
    onPlay(index);
  };

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

      <div className="chapters">
        {chapters.map((chapter, c) => {
          const done = chapter.levels.filter((l) => progress[l.name] !== undefined).length;
          const all = done === chapter.levels.length;
          const won = chapter.levels.reduce((n, l) => n + (progress[l.name] !== undefined ? eggsFor(progress[l.name], l.par) : 0), 0);
          const isOpen = open.has(chapter.name);
          return (
            <section key={chapter.name} className={all ? "chapter chapter--done" : "chapter"}>
              <h2>
                <button type="button" className="chapter__toggle" aria-expanded={isOpen} aria-controls={`chapter-${c}`} onClick={() => toggle(chapter.name)}>
                  <span className="chapter__head">
                    <span className="chapter__title">
                      {chapter.name}
                      <span className={`grade grade--${chapter.difficulty.toLowerCase()}`}>{chapter.difficulty}</span>
                    </span>
                    <span className="chapter__tally">
                      <span>
                        {done} of {chapter.levels.length} cleared
                      </span>
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
                      const best = progress[l.name];
                      const earned = best === undefined ? 0 : eggsFor(best, l.par);
                      return (
                        <li key={l.name}>
                          <button
                            type="button"
                            ref={l.index === lastPlayed ? cameFrom : undefined}
                            className={best !== undefined ? "level level--done" : l === next ? "level level--next" : "level"}
                            onClick={() => play(l.index)}
                            aria-label={`${chapter.name} ${i + 1}, ${l.name}${best !== undefined ? `, cleared with ${earned} of 3 eggs` : ""}`}
                          >
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
      </section>
    </main>
  );
}
