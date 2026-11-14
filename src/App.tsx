import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { dailyLevel, dayFromKey, dayKey } from "./game/daily";
import { eggsFor } from "./game/engine";
import { CHAPTERS, LEVELS } from "./game/levels";
import { decodeLevel, encodeLevel, findCode } from "./game/share";
import type { SharedLevel } from "./game/share";
import { moodFor } from "./music";
import { setEffectsVolume, setMusicEnabled, setMusicMood, setMusicVolume, setSoundEnabled, setVibrationEnabled, unlockAudio } from "./sfx";
import { ENDLESS, nextCoop, prepareCoop } from "./ui/endless";
import type { EndlessLevel } from "./ui/endless";
import { Stats } from "./ui/Stats";
import { specialPieces } from "./ui/Guide";
import { loadMet, saveMet } from "./ui/storage";
import { Editor, loadDraft } from "./ui/Editor";
import { Home } from "./ui/Home";
import type { HomeTab } from "./ui/Home";
import { Play } from "./ui/Play";
import { HatContext, wearing } from "./ui/rewards";
import type { Reward, Tally } from "./ui/rewards";
import { SettingsSheet } from "./ui/Settings";
import { better, endlessSaveId, loadCurrentCoops, loadEndless, loadProgress, loadSettings, saveCurrentCoop, saveEndless, saveInPlay, saveProgress, saveSettings } from "./ui/storage";
import type { Cleared, Progress, Settings } from "./ui/storage";

/**
 * What is on screen. Each kind but the list gets its own entry in the browser's history, so the
 * phone's back button steps back through them instead of leaving the game.
 */
export type Screen = { kind: "list" } | { kind: "level"; index: number } | { kind: "daily"; /** A past day's board, YYYY-MM-DD; today's when absent. */ day?: string } | { kind: "shared"; code: string; /** Opened from the editor to test it. */ test?: boolean } | { kind: "editor" } | { kind: "stats" } | { kind: "endless"; level: EndlessLevel; code: string };
/** What a level list button asks for: a numbered level, today's daily coop, or an earlier day's (YYYY-MM-DD). */
export type Playing = number | "daily" | { day: string };

const LIST: Screen = { kind: "list" };

/** The screen this history entry was showing. Where history is off limits, always the list. */
function screenInHistory(): Screen {
  try {
    const s = (window.history.state as { screen?: Screen } | null)?.screen;
    if (!s) return LIST;
    if (s.kind === "level" && LEVELS[s.index]) return s;
    if (s.kind === "daily" && (s.day === undefined || /^\d{4}-\d{2}-\d{2}$/.test(s.day))) return s;
    if (s.kind === "editor" || s.kind === "stats") return s;
    if (s.kind === "endless" && s.level in ENDLESS && typeof s.code === "string") return s;
    if (s.kind === "shared" && typeof s.code === "string") return s;
  } catch {
    /* fall through */
  }
  return LIST;
}

/** Opened from a link to a home-made coop: put the list behind it, so back lands somewhere sensible. */
function screenFromLink(): Screen | null {
  const code = location.hash.startsWith("#play=") ? findCode(location.hash) : null;
  if (!code) return null;
  try {
    window.history.replaceState({ screen: LIST }, "", location.pathname + location.search);
    window.history.pushState({ screen: { kind: "shared", code } }, "", `#play=${code}`);
  } catch {
    /* no history: just show it */
  }
  return { kind: "shared", code };
}

const ID_OF_NAME = Object.fromEntries(LEVELS.map((l) => [l.name, l.id]));

/** Eggs earned across the numbered levels. */
export const eggsEarned = (progress: Progress) => LEVELS.reduce((n, l) => n + (progress[l.id] ? eggsFor(progress[l.id].moves, l.par) : 0), 0);

/** Everything rewards are bought with: eggs and stars on the numbered levels, and daily coops cleared. */
export const tallyOf = (progress: Progress): Tally => ({
  eggs: eggsEarned(progress),
  stars: LEVELS.filter((l) => progress[l.id]?.solo).length,
  days: Object.keys(progress).filter((id) => id.startsWith("daily-")).length,
});

const samePlace = (a: Screen, b: Screen) => JSON.stringify(a) === JSON.stringify(b);

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => screenFromLink() ?? screenInHistory());
  const [lastPlayed, setLastPlayed] = useState<number | "daily" | null>(screen.kind === "level" ? screen.index : screen.kind === "daily" ? "daily" : null);
  const [progress, setProgress] = useState(() => loadProgress(ID_OF_NAME));
  const [settings, setSettings] = useState(loadSettings);
  // Pieces the player has been told about. A player from before this was recorded has met
  // every piece on the levels they have cleared, so start from those.
  useState(() => {
    if (loadMet()) return;
    const met = new Set<string>();
    for (const l of LEVELS) if (progress[l.id]) for (const p of specialPieces(l)) met.add(p.key);
    saveMet(met);
  });
  const [draft, setDraft] = useState(loadDraft);
  const [notice, setNotice] = useState<string | null>(null);
  /** The main screen's tab: back from a level, it shows the tab the level was played from. */
  const [tab, setTab] = useState<HomeTab>(() => (screen.kind === "daily" ? "daily" : screen.kind === "endless" ? "endless" : "levels"));
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Which day's coop is "today's". Looked at afresh whenever the level list comes up or the app
  // is brought back to the front, never in the middle of a level: midnight must not swap the board.
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    if (screen.kind !== "list") return;
    const look = () => setToday(dayKey(new Date()));
    look();
    document.addEventListener("visibilitychange", look);
    return () => document.removeEventListener("visibilitychange", look);
  }, [screen.kind]);
  // `today` is YYYY-MM-DD; build the date at noon so it is the same day in any time zone handling.
  const daily = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    return dailyLevel(new Date(y, m - 1, d, 12));
  }, [today]);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  useEffect(() => setVibrationEnabled(settings.vibrate), [settings.vibrate]);
  useEffect(() => setMusicEnabled(settings.music), [settings.music]);
  useEffect(() => setEffectsVolume(settings.volume / 100), [settings.volume]);
  useEffect(() => setMusicVolume(settings.musicVolume / 100), [settings.musicVolume]);
  // The music follows where the player is. The main screen, stats and the editor keep whatever
  // was playing, so popping back to the list between levels doesn't keep changing the tune.
  useEffect(() => {
    if (screen.kind === "level") {
      const chapter = CHAPTERS.findIndex((c) => c.levels.some((l) => l.index === screen.index));
      if (chapter >= 0) setMusicMood(moodFor({ kind: "level", difficulty: CHAPTERS[chapter].difficulty, chapter }));
    } else if (screen.kind === "daily") setMusicMood(moodFor({ kind: "daily" }));
    else if (screen.kind === "endless") setMusicMood(moodFor({ kind: "endless", level: screen.level }));
    else if (screen.kind === "shared") setMusicMood(moodFor({ kind: "coop" }));
  }, [screen]);
  // Browsers only allow sound after a tap: the first one anywhere starts it (and the music).
  useEffect(() => {
    const first = () => unlockAudio();
    document.addEventListener("pointerdown", first, { once: true });
    document.addEventListener("keydown", first, { once: true });
    return () => {
      document.removeEventListener("pointerdown", first);
      document.removeEventListener("keydown", first);
    };
  }, []);
  // The stylesheet reads these off the root element.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    root.classList.toggle("big-text", settings.bigText);
    root.classList.toggle("contrast", settings.contrast);
    root.classList.toggle("calm", settings.calm);
  }, [settings.theme, settings.bigText, settings.contrast, settings.calm]);

  // Endless mode: clears at each difficulty, and the coop being grown while the player waits.
  const [endless, setEndless] = useState(loadEndless);
  const [growing, setGrowing] = useState<EndlessLevel | null>(null);
  /** The coop being played at each difficulty, until it is cleared: it can be resumed. */
  const [current, setCurrent] = useState(loadCurrentCoops);
  const growTicket = useRef(0);

  const tally = tallyOf(progress);
  const board = wearing("board", settings.board, tally, "barn");
  const hat = wearing("hat", settings.hat, tally, "none");
  useEffect(() => {
    document.documentElement.dataset.board = board;
  }, [board]);

  const changeSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const changeProgress = (p: Progress) => {
    setProgress(p);
    saveProgress(p);
  };

  // Back and forward: show whatever that entry was showing.
  useEffect(() => {
    const onPop = () => {
      const s = screenInHistory();
      if (s.kind === "level") setLastPlayed(s.index);
      if (s.kind === "daily") setLastPlayed("daily");
      setSettingsOpen(false);
      setScreen(s);
    };
    // A coop link pasted into the address bar of a game that is already open.
    const onHash = () => {
      const s = screenFromLink();
      if (s) setScreen(s);
    };
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onHash);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onHash);
    };
  }, []);

  /** Go to a screen. From one level straight to the next replaces the entry, so back still means the list. */
  const go = (next: Screen, replace = false) => {
    const hash = next.kind === "shared" ? `#play=${next.code}` : location.pathname + location.search;
    try {
      if (replace) window.history.replaceState({ screen: next }, "", hash);
      else window.history.pushState({ screen: next }, "", hash);
    } catch {
      /* no history here: the on-screen buttons still work */
    }
    if (next.kind === "level") setLastPlayed(next.index);
    if (next.kind === "daily") setLastPlayed("daily");
    // Wherever this was started from is where back lands.
    const from: HomeTab | null = next.kind === "level" ? "levels" : next.kind === "daily" ? "daily" : next.kind === "endless" ? "endless" : next.kind === "stats" || next.kind === "editor" ? "you" : null;
    if (from) setTab(from);
    setNotice(null);
    setScreen(next);
  };

  const play = (which: Playing) =>
    go(which === "daily" ? { kind: "daily" } : typeof which === "number" ? { kind: "level", index: which } : { kind: "daily", day: which.day }, screen.kind === "level" || screen.kind === "daily");

  /** Leave this screen the way the back button would. */
  const back = () => {
    const here = screenInHistory();
    if (samePlace(here, LIST)) return setScreen(LIST);
    window.history.back();
    // If nothing is behind this entry (a restored tab, say) back does nothing: go to the list anyway.
    window.setTimeout(() => {
      if (!samePlace(screenInHistory(), here)) return;
      try {
        window.history.replaceState({ screen: LIST }, "", location.pathname + location.search);
      } catch {
        /* as above */
      }
      setScreen(LIST);
    }, 400);
  };

  const sharedLevel = useMemo(() => (screen.kind === "shared" || screen.kind === "endless" ? decodeLevel(screen.code) : null), [screen]);
  useEffect(() => {
    if ((screen.kind === "shared" || screen.kind === "endless") && !sharedLevel) {
      try {
        window.history.replaceState({ screen: LIST }, "", location.pathname + location.search);
      } catch {
        /* as above */
      }
      setScreen(LIST);
      setNotice("That link doesn’t hold a coop this game can read. Check that all of it was copied.");
    }
  }, [screen, sharedLevel]);

  // A past day's board, caught up on. Today's is `daily`, which turns over only on the level list.
  const pastDay = screen.kind === "daily" && screen.day && screen.day !== today ? screen.day : null;
  const pastDaily = useMemo(() => (pastDay ? dailyLevel(dayFromKey(pastDay)) : null), [pastDay]);
  const level = screen.kind === "level" ? LEVELS[screen.index] : screen.kind === "daily" ? (pastDaily ?? daily) : sharedLevel;
  const levelId = screen.kind === "level" || screen.kind === "daily" ? level?.id : undefined;
  const endlessLevel = screen.kind === "endless" ? screen.level : null;
  const cleared = useCallback(
    (moves: number, solo: boolean, clock: boolean, hard: boolean) => {
      if (endlessLevel) {
        setEndless((c) => {
          const next = { ...c, [endlessLevel]: c[endlessLevel] + 1 };
          saveEndless(next);
          return next;
        });
        saveCurrentCoop(endlessLevel, null);
        setCurrent(loadCurrentCoops());
        return;
      }
      // Home-made coops are played for fun: they leave no record.
      if (!levelId) return;
      const record: Cleared = { moves, ...(solo ? { solo } : {}), ...(clock ? { clock } : {}), ...(pastDay ? { late: true } : {}), ...(hard ? { hard } : {}) };
      setProgress((p) => {
        const was = p[levelId];
        const now = better(was, record);
        if (was && JSON.stringify(was) === JSON.stringify(now)) return p;
        const next = { ...p, [levelId]: now };
        saveProgress(next);
        return next;
      });
    },
    [levelId, pastDay, endlessLevel],
  );

  /**
   * Play a coop at this difficulty: the one left unfinished there, unless `fresh` asks for a new
   * one, which is grown and replaces it. `replace` when going straight on from another coop.
   */
  const playEndless = (which: EndlessLevel, fresh = false, replace = false) => {
    if (!fresh && current[which]) return go({ kind: "endless", level: which, code: current[which]! }, replace);
    const ticket = ++growTicket.current;
    setGrowing(which);
    nextCoop(which).then(
      (code) => {
        if (growTicket.current !== ticket) return; // cancelled
        setGrowing(null);
        // A new coop at this difficulty: the old one's half-played board goes with it.
        saveInPlay(endlessSaveId(which), null);
        saveCurrentCoop(which, code);
        setCurrent(loadCurrentCoops());
        go({ kind: "endless", level: which, code }, replace);
      },
      () => {
        if (growTicket.current !== ticket) return;
        setGrowing(null);
        setNotice("Couldn’t grow a coop this time. Try again.");
      },
    );
  };
  // Once a grown coop is on screen, start growing the next one.
  useEffect(() => {
    if (endlessLevel) prepareCoop(endlessLevel);
  }, [endlessLevel]);

  /** Put on a reward that has just been unlocked. */
  const wear = (r: Reward) => changeSettings(r.kind === "board" ? { ...settings, board: r.id as Settings["board"] } : { ...settings, hat: r.id as Settings["hat"] });

  const openCode = (text: string): boolean => {
    const code = findCode(text);
    if (!code || !decodeLevel(code)) return false;
    go({ kind: "shared", code });
    return true;
  };

  let view;
  if (screen.kind === "stats") {
    view = <Stats chapters={CHAPTERS} progress={progress} tally={tally} endless={endless} today={today} onBack={back} />;
  } else if (screen.kind === "editor") {
    view = <Editor draft={draft} onDraft={setDraft} onBack={back} onPlay={(s: SharedLevel) => go({ kind: "shared", code: encodeLevel(s), test: true })} />;
  } else if (!level) {
    view = (
      <Home
        chapters={CHAPTERS}
        daily={daily}
        progress={progress}
        tally={tally}
        today={today}
        lastPlayed={lastPlayed}
        notice={notice}
        endless={endless}
        endlessCurrent={current}
        tab={tab}
        onTab={(t) => {
          setTab(t);
          setNotice(null);
        }}
        onEndless={(which, fresh) => playEndless(which, fresh)}
        onEndlessCount={(c) => {
          setEndless(c);
          saveEndless(c);
        }}
        onStats={() => go({ kind: "stats" })}
        onPlay={play}
        onSettings={() => setSettingsOpen(true)}
        onProgress={changeProgress}
        onEditor={() => go({ kind: "editor" })}
        onCode={openCode}
      />
    );
  } else {
    const chapter = CHAPTERS.find((c) => c.levels.includes(level));
    const next = chapter && level.index + 1 < LEVELS.length ? level.index + 1 : null;
    const nextChapter = next !== null ? CHAPTERS.find((c) => c.levels.includes(LEVELS[next])) : undefined;
    // Milestones this level would reach if cleared now: the last of a chapter, or of the game.
    const firstClear = chapter !== undefined && !progress[level.id];
    const othersDone = (levels: typeof LEVELS) => levels.every((l) => l === level || progress[l.id]);
    const finishesChapter = firstClear && othersDone(chapter.levels) ? { name: chapter.name, levels: chapter.levels.length } : null;
    const finishesGame = firstClear && othersDone(LEVELS) ? { levels: LEVELS.length } : null;
    view = (
      <Play
        key={level.id + (screen.kind === "shared" || screen.kind === "endless" ? screen.code : "")}
        level={level}
        where={chapter ? `${chapter.name}, ${chapter.levels.indexOf(level) + 1} of ${chapter.levels.length}` : screen.kind === "shared" && screen.test ? "Testing your coop" : screen.kind === "endless" ? `Endless coop, ${ENDLESS[screen.level].name.toLowerCase()}` : level.chapter}
        best={levelId ? progress[levelId] : undefined}
        saveId={levelId ?? (screen.kind === "endless" ? endlessSaveId(screen.level) : undefined)}
        shareLink={(screen.kind === "shared" && !screen.test) || screen.kind === "endless" ? `${location.origin}${location.pathname}#play=${screen.code}` : undefined}
        finishesChapter={finishesChapter}
        finishesGame={finishesGame}
        nextChapter={nextChapter && nextChapter !== chapter ? nextChapter.name : null}
        daily={screen.kind === "daily"}
        late={pastDay !== null}
        settings={settings}
        tally={tally}
        backLabel={screen.kind === "shared" && screen.test ? "Editor" : "Levels"}
        onCleared={cleared}
        onNext={screen.kind === "endless" ? () => playEndless(screen.level, true, true) : next === null ? null : () => play(next)}
        nextLabel={screen.kind === "endless" ? "Next coop" : undefined}
        onLevels={back}
        onSettings={() => setSettingsOpen(true)}
        onWear={wear}
      />
    );
  }
  return (
    <HatContext.Provider value={hat}>
      {view}
      {growing && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="growing-title">
          <div className="sheet__card growing">
            <div className="growing__egg" aria-hidden="true" />
            <h2 id="growing-title">Growing a coop…</h2>
            <p>A fresh {ENDLESS[growing].name.toLowerCase()} puzzle, checked so it can be cleared. It takes a few seconds.</p>
            <div className="sheet__actions">
              <button
                type="button"
                className="btn btn--quiet"
                onClick={() => {
                  growTicket.current++;
                  setGrowing(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
      {settingsOpen && <SettingsSheet settings={settings} tally={tally} onSettings={changeSettings} onClose={() => setSettingsOpen(false)} />}
    </HatContext.Provider>
  );
}
