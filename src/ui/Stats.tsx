// Stats and achievements: everything worked out from saved progress.

import type { ReactElement } from "react";
import { dailyStreak, dayFromKey, longestStreak } from "../game/daily";
import { eggsFor } from "../game/engine";
import type { Chapter } from "../game/levels";
import { achievements } from "./achievements";
import { ClockArt, HardArt, SoloArt } from "./art";
import type { Tally } from "./rewards";
import type { EndlessCount, Progress } from "./storage";

interface Props {
  chapters: Chapter[];
  progress: Progress;
  tally: Tally;
  endless: EndlessCount;
  /** Today, as YYYY-MM-DD. */
  today: string;
  onBack: () => void;
}

export function Stats({ chapters, progress, tally, endless, today, onBack }: Props) {
  const levels = chapters.flatMap((c) => c.levels);
  const done = levels.filter((l) => progress[l.id]);
  const over = done.reduce((n, l) => n + Math.max(0, progress[l.id].moves - l.par), 0);
  const atPar = done.filter((l) => progress[l.id].moves <= l.par).length;
  const dailyIds = Object.keys(progress).filter((id) => id.startsWith("daily-"));
  const onTime = dailyIds.filter((id) => !progress[id].late).map((id) => id.slice(6));
  const streak = dailyStreak((id) => progress[id] !== undefined && !progress[id].late, dayFromKey(today));
  const goals = achievements(chapters, progress, endless);

  const tile = (value: string | number, label: string, art?: ReactElement) => (
    <div className="stats-tile">
      <dd>
        {art}
        {value}
      </dd>
      <dt>{label}</dt>
    </div>
  );

  return (
    <main className="screen stats-page">
      <header className="stats-page__top">
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          Levels
        </button>
        <h1>Your stats</h1>
      </header>

      <section aria-labelledby="levels-title">
        <h2 id="levels-title">Levels</h2>
        <dl className="stats-grid">
          {tile(`${done.length} of ${levels.length}`, "cleared")}
          {tile(tally.eggs, `of ${levels.length * 3} eggs`)}
          {tile(tally.stars, "stars, no hints", <SoloArt />)}
          {tile(done.filter((l) => progress[l.id].clock).length, "beat the clock", <ClockArt />)}
          {tile(done.filter((l) => progress[l.id].hard).length, "in hard mode", <HardArt />)}
          {tile(done.length ? `${Math.round((atPar / done.length) * 100)}%` : "–", "cleared at par")}
          {tile(done.length ? (over / done.length).toFixed(1) : "–", "moves over par, on average")}
        </dl>
      </section>

      <section aria-labelledby="daily-title">
        <h2 id="daily-title">Daily coop</h2>
        <dl className="stats-grid">
          {tile(dailyIds.length, "boards cleared")}
          {tile(streak, "day streak now")}
          {tile(longestStreak(onTime), "longest day streak")}
          {tile(dailyIds.length - onTime.length, "caught up late")}
        </dl>
      </section>

      <section aria-labelledby="endless-stats-title">
        <h2 id="endless-stats-title">Endless coop</h2>
        <dl className="stats-grid">
          {tile(endless.easy, "easy cleared")}
          {tile(endless.medium, "medium cleared")}
          {tile(endless.hard, "hard cleared")}
        </dl>
      </section>

      <section aria-labelledby="chapters-title">
        <h2 id="chapters-title">Chapters</h2>
        <ul className="stats-chapters">
          {chapters.map((c) => {
            const eggs = c.levels.reduce((n, l) => n + (progress[l.id] ? eggsFor(progress[l.id].moves, l.par) : 0), 0);
            const share = eggs / (c.levels.length * 3);
            return (
              <li key={c.name}>
                <span className="stats-chapters__name">{c.name}</span>
                <span className="stats-chapters__bar" role="img" aria-label={`${eggs} of ${c.levels.length * 3} eggs`}>
                  <span style={{ width: `${Math.round(share * 100)}%` }} />
                </span>
                <span className="stats-chapters__eggs">
                  {eggs}/{c.levels.length * 3}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="goals-title">
        <h2 id="goals-title">
          Achievements <span className="stats-page__count">{goals.filter((g) => g.have >= g.need).length} of {goals.length}</span>
        </h2>
        <ul className="goals">
          {goals.map((g) => {
            const got = g.have >= g.need;
            return (
              <li key={g.id} className={got ? "goal goal--done" : "goal"}>
                <span className="goal__mark" aria-hidden="true">
                  {got ? "✓" : ""}
                </span>
                <span className="goal__text">
                  <span className="goal__name">{g.name}</span>
                  <span className="goal__about">{g.about}</span>
                  {!got && (
                    <span className="goal__bar" role="img" aria-label={`${g.have} of ${g.need}`}>
                      <span style={{ width: `${Math.round((g.have / g.need) * 100)}%` }} />
                    </span>
                  )}
                </span>
                <span className="sr-only">{got ? "Done." : `${g.have} of ${g.need}.`}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
