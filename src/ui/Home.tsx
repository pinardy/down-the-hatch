import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import type { Playing } from "../App";
import { dailyId, dailyStreak, dayFromKey, dayKey, earlierDays, msUntilTomorrow, untilText } from "../game/daily";
import { eggsFor } from "../game/engine";
import type { Chapter } from "../game/levels";
import type { Level } from "../game/types";
import { unlockAudio } from "../sfx";
import { useUpdateReady } from "../update";
import { ClockArt, EggArt, GearArt, HardArt, SoloArt, TitleArt } from "./art";
import { achievements } from "./achievements";
import { ENDLESS } from "./endless";
import type { EndlessLevel } from "./endless";
import { Guide } from "./Guide";
import type { Tally } from "./rewards";
import { rewardsAhead } from "./Settings";
import { decodeBackup, encodeProgress, inPlayIds, mergeEndless, mergeProgress } from "./storage";
import type { CurrentCoops, EndlessCount, Progress } from "./storage";

/** The four parts of the main screen, chosen from the bar along the bottom. */
export type HomeTab = "levels" | "daily" | "endless" | "you";

function LevelsIcon() {
  return (
    <svg className="tabs__icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" />
    </svg>
  );
}
function DailyIcon() {
  return (
    <svg className="tabs__icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M3 10 h18" className="tabs__cut" />
      <rect x="7" y="2.5" width="2.4" height="5" rx="1.2" />
      <rect x="14.6" y="2.5" width="2.4" height="5" rx="1.2" />
    </svg>
  );
}
function EndlessIcon() {
  return (
    <svg className="tabs__icon tabs__icon--line" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12 c-2.5 -3.5 -7 -4 -8.5 -1 c-1.2 2.6 1 5 3.5 5 c2 0 3.4 -1.6 5 -4 c1.6 -2.4 3 -4 5 -4 c2.5 0 4.7 2.4 3.5 5 c-1.5 3 -6 2.5 -8.5 -1 z" />
    </svg>
  );
}
function YouIcon() {
  return (
    <svg className="tabs__icon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21 c0 -4.5 3.6 -7.5 8 -7.5 s8 3 8 7.5 z" />
    </svg>
  );
}
const TABS: [HomeTab, string, () => ReactElement][] = [
  ["levels", "Levels", LevelsIcon],
  ["daily", "Daily", DailyIcon],
  ["endless", "Endless", EndlessIcon],
  ["you", "You", YouIcon],
];

/** Which levels the list shows: all of them, or only those with something left to win. */
type Filter = "all" | "uncleared" | "eggs" | "star";
const FILTERS: [Filter, string][] = [
  ["all", "All"],
  ["uncleared", "Not cleared"],
  ["eggs", "Under 3 eggs"],
  ["star", "No star"],
];

/** How many missed daily coops can still be caught up on. */
const CATCH_UP_DAYS = 6;

interface Props {
  chapters: Chapter[];
  /** Today's daily coop. */
  daily: Level;
  progress: Progress;
  /** Today, as YYYY-MM-DD. */
  today: string;
  /** The level just played, if any: its chapter starts open. */
  lastPlayed: Playing | null;
  /** Eggs, stars and daily coops earned. */
  tally: Tally;
  /** Something to tell the player as the list comes up (a broken link, say). */
  notice: string | null;
  onPlay: (which: Playing) => void;
  /** Open the settings and rewards sheet. */
  onSettings: () => void;
  /** Replace all saved progress (after restoring a backup, or erasing). */
  onProgress: (p: Progress) => void;
  onEditor: () => void;
  /** Clears of grown coops at each difficulty. */
  endless: EndlessCount;
  /** Play a coop at this difficulty: the unfinished one, or a `fresh` one. */
  onEndless: (level: EndlessLevel, fresh: boolean) => void;
  /** The unfinished coop at each difficulty, if any. */
  endlessCurrent: CurrentCoops;
  /** Replace the endless clears (after restoring a backup, or erasing). */
  onEndlessCount: (c: EndlessCount) => void;
  /** Which tab is showing, and a way to change it. */
  tab: HomeTab;
  onTab: (tab: HomeTab) => void;
  onStats: () => void;
  /** Open a home-made coop from a pasted code or link. False if it isn't one. */
  onCode: (text: string) => boolean;
}

export function Home({ chapters, daily, progress, today, tally, lastPlayed, notice, endless, endlessCurrent, onEndless, onEndlessCount, tab, onTab, onStats, onPlay, onSettings, onProgress, onEditor, onCode }: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const shows = (l: Level) => {
    const r = progress[l.id];
    if (filter === "uncleared") return !r;
    if (filter === "eggs") return !r || eggsFor(r.moves, l.par) < 3;
    if (filter === "star") return !r?.solo;
    return true;
  };
  const goals = achievements(chapters, progress, endless);
  const goalsDone = goals.filter((g) => g.have >= g.need).length;
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
  const play = (which: Playing) => {
    unlockAudio();
    onPlay(which);
  };

  const dailyBest = progress[daily.id];
  // A board caught up on late doesn't keep a streak going.
  const streak = dailyStreak((id) => progress[id] !== undefined && !progress[id].late, dayFromKey(today));
  // The daily coop uses pieces the tutorial teaches, so it opens once the tutorial is done.
  const tutorial = chapters[0];
  const taught = tutorial.levels.filter((l) => progress[l.id]).length;
  const dailyOpen = taught === tutorial.levels.length || Object.keys(progress).some((id) => id.startsWith("daily-"));
  const missed = earlierDays(dayFromKey(today), CATCH_UP_DAYS).map((d) => ({ key: dayKey(d), id: dailyId(d), date: d }));
  const unfinished = useState(inPlayIds)[0];
  // Once today's is done, count down to the next one.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!dailyBest) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [dailyBest]);
  const updateReady = useUpdateReady();
  const [guide, setGuide] = useState(false);
  const [pasted, setPasted] = useState("");
  const [badCode, setBadCode] = useState(false);

  // A new tab starts at its top. (Not on the way in: then the list scrolls to the level just played.)
  const mainRef = useRef<HTMLElement>(null);
  const shownTab = useRef(tab);
  useEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    mainRef.current?.scrollTo(0, 0);
  }, [tab]);

  const growEndless = (which: EndlessLevel, fresh: boolean) => {
    unlockAudio();
    onEndless(which, fresh);
  };

  return (
    <main className="screen home" ref={mainRef}>
      <button type="button" className="btn btn--quiet home__gear" onClick={onSettings} aria-label="Settings and rewards">
        <GearArt />
      </button>
      {notice && (
        <p className="home__notice" role="alert">
          {notice}
        </p>
      )}

      {tab === "levels" && (
        <>
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
      <div className="filters" role="group" aria-label="Show levels">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" className={filter === value ? "chip chip--on" : "chip"} aria-pressed={filter === value} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>
      {filter !== "all" && !levels.some(shows) && <p className="filters__none">Nothing left here. Every level has {filter === "uncleared" ? "been cleared" : filter === "eggs" ? "all three eggs" : "a star"}.</p>}

      <div className="chapters">
        {chapters.map((chapter, c) => {
          const done = chapter.levels.filter((l) => progress[l.id]).length;
          const all = done === chapter.levels.length;
          const won = chapter.levels.reduce((n, l) => n + eggsOn(l), 0);
          // Filtering opens every chapter with a match and hides the rest.
          if (filter !== "all" && !chapter.levels.some(shows)) return null;
          const isOpen = filter !== "all" || open.has(chapter.name);
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
                      if (!shows(l)) return null;
                      const best = progress[l.id];
                      const earned = eggsOn(l);
                      return (
                        <li key={l.id}>
                          <button
                            type="button"
                            ref={l.index === lastPlayed ? cameFrom : undefined}
                            className={best ? "level level--done" : l === next ? "level level--next" : "level"}
                            onClick={() => play(l.index)}
                            aria-label={`${chapter.name} ${i + 1}, ${l.name}${best ? `, cleared with ${earned} of 3 eggs${best.solo ? ", without hints" : ""}${best.clock ? ", beat the clock" : ""}${best.hard ? ", in hard mode" : ""}` : unfinished.has(l.id) ? ", started" : ""}`}
                          >
                            {(best?.solo || best?.clock || best?.hard) && (
                              <span className="level__badges">
                                {best.hard && <HardArt />}
                                {best.clock && <ClockArt />}
                                {best.solo && <SoloArt />}
                              </span>
                            )}
                            {!best && unfinished.has(l.id) && <span className="level__started">Started</span>}
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
        </>
      )}

      {tab === "daily" && (
        <>
          <h1 className="home__tab-title">Daily coop</h1>
      {dailyOpen ? (
        <section className="daily-box" aria-label="Daily coop">
          <button type="button" className={dailyBest ? "daily daily--done" : "daily"} onClick={() => play("daily")}>
            <span className="daily__text">
              <span className="daily__title">
                Today
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
                  `A new board every day, harder as the week goes on. Par ${daily.par}.`
                )}
              </span>
              {dailyBest && <span className="daily__about">Next board in {untilText(msUntilTomorrow(new Date(now)))}.</span>}
              {streak > 1 && <span className="daily__streak">{streak} days in a row</span>}
            </span>
            <span className="daily__go">{dailyBest ? "Again" : unfinished.has(daily.id) ? "Resume" : "Play"}</span>
          </button>
          <div className="catch-up">
            <span className="catch-up__label">Earlier boards</span>
            <ol className="catch-up__days">
              {missed.map((d) => {
                const rec = progress[d.id];
                return (
                  <li key={d.key}>
                    <button
                      type="button"
                      className={rec ? "catch-up__day catch-up__day--done" : "catch-up__day"}
                      onClick={() => play({ day: d.key })}
                      aria-label={`${d.date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}${rec ? `, cleared in ${rec.moves} moves${rec.late ? ", late" : ""}` : unfinished.has(d.id) ? ", started" : ", not played"}`}
                    >
                      <span className="catch-up__weekday">{d.date.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="catch-up__mark" aria-hidden="true">
                        {rec ? "✓" : unfinished.has(d.id) ? "…" : d.date.getDate()}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      ) : (
        <div className="daily daily--locked" role="note">
          <span className="daily__text">
            <span className="daily__title">Not open yet</span>
            <span className="daily__about">
              A new board every day. It opens once you’ve cleared the tutorial ({taught} of {tutorial.levels.length}).
            </span>
          </span>
        </div>
      )}
        </>
      )}

      {tab === "endless" && (
        <>
          <h1 className="home__tab-title">Endless coop</h1>
      <section className="endless" aria-label="Endless coop">
        <p className="keeping__about">Fresh puzzles grown on the spot, as many as you like. Each is checked so it can be cleared.</p>
        <div className="endless__choices">
          {(Object.keys(ENDLESS) as EndlessLevel[]).map((which) => (
            <div key={which} className="endless__choice">
              <span className="endless__name">{ENDLESS[which].name}</span>
              <span className="endless__about">{ENDLESS[which].about}</span>
              <span className="endless__count">{endless[which] ? `${endless[which]} cleared` : "None cleared yet"}</span>
              <span className="endless__actions">
                {endlessCurrent[which] && (
                  <button type="button" className="btn btn--straw" onClick={() => growEndless(which, false)}>
                    Resume
                  </button>
                )}
                <button type="button" className={endlessCurrent[which] ? "btn btn--quiet" : "btn btn--straw"} onClick={() => growEndless(which, true)}>
                  {endlessCurrent[which] ? "New coop" : "Grow one"}
                </button>
              </span>
            </div>
          ))}
        </div>
      </section>
        </>
      )}

      {tab === "you" && (
        <>
          <h1 className="home__tab-title">You</h1>
      <section className="home__more" aria-labelledby="stats-title">
        <h2 id="stats-title">Stats and achievements</h2>
        <p className="keeping__about">
          {goalsDone} of {goals.length} achievements.{" "}
          {goals.find((g) => g.have < g.need) ? `Next up: ${goals.find((g) => g.have < g.need)!.name}, ${goals.find((g) => g.have < g.need)!.about.toLowerCase()}` : "Every one of them. Well done."}
        </p>
        <div className="keeping__actions">
          <button type="button" className="btn" onClick={onStats}>
            See your stats
          </button>
        </div>
      </section>

      <section className="home__more" aria-labelledby="more-title">
        <h2 id="more-title">Rewards and settings</h2>
        <p className="keeping__about">
          {tally.eggs} eggs, {tally.stars} stars and {tally.days} daily coops so far. {rewardsAhead(tally)[0] ?? "Everything unlocked."}
        </p>
        <div className="keeping__actions">
          <button type="button" className="btn btn--straw" onClick={onSettings}>
            Rewards and settings
          </button>
          <button type="button" className="btn btn--quiet" onClick={() => setGuide(true)}>
            What the pieces do
          </button>
        </div>
      </section>

      <section className="own" aria-labelledby="own-title">
        <h2 id="own-title">Make your own</h2>
        <p className="keeping__about">Build a coop, let the game check it and set its par, then send it to someone as a link.</p>
        <div className="keeping__actions">
          <button type="button" className="btn btn--straw" onClick={onEditor}>
            Level editor
          </button>
        </div>
        <form
          className="own__code"
          onSubmit={(e) => {
            e.preventDefault();
            setBadCode(!onCode(pasted));
          }}
        >
          <input
            value={pasted}
            onChange={(e) => {
              setPasted(e.target.value);
              setBadCode(false);
            }}
            placeholder="Paste a coop link or code"
            aria-label="Coop link or code"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
          <button type="submit" className="btn" disabled={!pasted.trim()}>
            Play
          </button>
        </form>
        {badCode && <p className="keeping__said keeping__said--warn">That isn’t a coop this game can read. Check that all of it was copied.</p>}
      </section>

          <Keeping progress={progress} endless={endless} onProgress={onProgress} onEndless={onEndlessCount} />
        </>
      )}

      {guide && <Guide level={null} onClose={() => setGuide(false)} />}
      {updateReady && (
        <div className="update" role="status">
          <span>A new version is ready.</span>
          <button type="button" className="btn btn--straw" onClick={() => window.location.reload()}>
            Refresh
          </button>
        </div>
      )}

      <nav className="tabs" aria-label="Sections">
        {TABS.map(([value, label, Icon]) => (
          <button key={value} type="button" className={tab === value ? "tabs__tab tabs__tab--on" : "tabs__tab"} aria-current={tab === value ? "page" : undefined} onClick={() => onTab(value)}>
            <Icon />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </main>
  );
}

/**
 * Looking after saved progress. It lives in this browser and nowhere else, so there is a way
 * to carry it out as a line of text, a way to bring one back in, and a way to wipe the slate.
 */
function Keeping({ progress, endless, onProgress, onEndless }: { progress: Progress; endless: EndlessCount; onProgress: (p: Progress) => void; onEndless: (c: EndlessCount) => void }) {
  const [panel, setPanel] = useState<"code" | "restore" | "reset" | null>(null);
  const [said, setSaid] = useState<{ text: string; warn?: boolean } | null>(null);
  const [pasted, setPasted] = useState("");
  const count = Object.keys(progress).length;
  const code = panel === "code" ? encodeProgress(progress, endless) : "";

  const show = (which: typeof panel) => {
    setPanel(which);
    setSaid(null);
  };

  const backUp = async () => {
    show("code");
    try {
      await navigator.clipboard.writeText(encodeProgress(progress, endless));
      setSaid({ text: "Copied. Paste it somewhere safe, like a note or a message to yourself." });
    } catch {
      setSaid({ text: "Copy the code below and keep it somewhere safe." });
    }
  };

  const restore = () => {
    const backup = decodeBackup(pasted);
    if (!backup) return setSaid({ text: "That isn’t a backup code. Check that all of it was copied.", warn: true });
    // Merging keeps the better record for every level, so restoring can never lose progress.
    const merged = mergeProgress(progress, backup.progress);
    onProgress(merged);
    onEndless(mergeEndless(endless, backup.endless));
    setPasted("");
    setPanel(null);
    setSaid({ text: `Restored. ${Object.keys(merged).length} cleared coops are saved here now.` });
  };

  const erase = () => {
    onProgress({});
    onEndless({ easy: 0, medium: 0, hard: 0 });
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
