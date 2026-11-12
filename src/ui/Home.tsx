import { eggsFor } from "../game/engine";
import type { Chapter } from "../game/levels";
import { unlockAudio } from "../sfx";
import { EggArt, TitleArt } from "./art";
import type { Progress, Settings } from "./storage";

interface Props {
  chapters: Chapter[];
  progress: Progress;
  settings: Settings;
  onPlay: (index: number) => void;
  onSettings: (s: Settings) => void;
}

export function Home({ chapters, progress, settings, onPlay, onSettings }: Props) {
  const levels = chapters.flatMap((c) => c.levels);
  const next = levels.find((l) => progress[l.name] === undefined);
  const nextIn = next && chapters.find((c) => c.levels.includes(next))!;
  const cleared = levels.filter((l) => progress[l.name] !== undefined).length;
  const eggs = levels.reduce((n, l) => n + (progress[l.name] !== undefined ? eggsFor(progress[l.name], l.par) : 0), 0);
  const play = (index: number) => {
    unlockAudio();
    onPlay(index);
  };

  return (
    <main className="screen home">
      <header className="home__hero">
        <TitleArt />
        <h1 className="home__title">
          Down the
          <br />
          Hatch
        </h1>
        <p className="home__pitch">Slide a hatch under chickens of its own colour and down they go. Clear the coop.</p>
        <button type="button" className="btn btn--straw btn--big" onClick={() => play(next ? next.index : 0)}>
          {next && nextIn ? (cleared === 0 ? "Start playing" : `Play ${nextIn.name} ${nextIn.levels.indexOf(next) + 1}`) : "Play from the start"}
        </button>
        <p className="home__tally">
          {cleared} of {levels.length} levels cleared, {eggs} of {levels.length * 3} eggs
        </p>
      </header>

      {chapters.map((chapter) => {
        const done = chapter.levels.filter((l) => progress[l.name] !== undefined).length;
        return (
          <section key={chapter.name} className="chapter" aria-labelledby={`chapter-${chapter.name}`}>
            <h2 id={`chapter-${chapter.name}`}>
              {chapter.name}
              <span className="chapter__tally">
                {done} of {chapter.levels.length}
              </span>
            </h2>
            <p className="chapter__blurb">{chapter.blurb}</p>
            <ol className="level-grid">
              {chapter.levels.map((l, i) => {
                const best = progress[l.name];
                const earned = best === undefined ? 0 : eggsFor(best, l.par);
                return (
                  <li key={l.name}>
                    <button
                      type="button"
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
          </section>
        );
      })}

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
