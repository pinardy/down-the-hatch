import { useCallback, useEffect, useMemo, useState } from "react";
import { dailyLevel, dayKey } from "./game/daily";
import { eggsFor } from "./game/engine";
import { CHAPTERS, LEVELS } from "./game/levels";
import { decodeLevel, encodeLevel, findCode } from "./game/share";
import type { SharedLevel } from "./game/share";
import { setSoundEnabled } from "./sfx";
import { Editor, loadDraft } from "./ui/Editor";
import { Home } from "./ui/Home";
import { Play } from "./ui/Play";
import { HatContext, wearing } from "./ui/rewards";
import { better, loadProgress, loadSettings, saveProgress, saveSettings } from "./ui/storage";
import type { Progress, Settings } from "./ui/storage";

/**
 * What is on screen. Each kind but the list gets its own entry in the browser's history, so the
 * phone's back button steps back through them instead of leaving the game.
 */
export type Screen = { kind: "list" } | { kind: "level"; index: number } | { kind: "daily" } | { kind: "shared"; code: string; /** Opened from the editor to test it. */ test?: boolean } | { kind: "editor" };
/** What a level list button asks for: a numbered level, or today's daily coop. */
export type Playing = number | "daily";

const LIST: Screen = { kind: "list" };

/** The screen this history entry was showing. Where history is off limits, always the list. */
function screenInHistory(): Screen {
  try {
    const s = (window.history.state as { screen?: Screen } | null)?.screen;
    if (!s) return LIST;
    if (s.kind === "level" && LEVELS[s.index]) return s;
    if (s.kind === "daily" || s.kind === "editor") return s;
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

/** Eggs earned across the numbered levels: what rewards are bought with. */
export const eggsEarned = (progress: Progress) => LEVELS.reduce((n, l) => n + (progress[l.id] ? eggsFor(progress[l.id].moves, l.par) : 0), 0);

const samePlace = (a: Screen, b: Screen) => JSON.stringify(a) === JSON.stringify(b);

export default function App() {
  const [screen, setScreen] = useState<Screen>(() => screenFromLink() ?? screenInHistory());
  const [lastPlayed, setLastPlayed] = useState<number | "daily" | null>(screen.kind === "level" ? screen.index : screen.kind === "daily" ? "daily" : null);
  const [progress, setProgress] = useState(() => loadProgress(ID_OF_NAME));
  const [settings, setSettings] = useState(loadSettings);
  const [draft, setDraft] = useState(loadDraft);
  const [notice, setNotice] = useState<string | null>(null);

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
  // The stylesheet reads these off the root element.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    root.classList.toggle("big-text", settings.bigText);
  }, [settings.theme, settings.bigText]);

  const eggs = eggsEarned(progress);
  const board = wearing("board", settings.board, eggs, "barn");
  const hat = wearing("hat", settings.hat, eggs, "none");
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
    setNotice(null);
    setScreen(next);
  };

  const play = (which: Playing) => go(which === "daily" ? { kind: "daily" } : { kind: "level", index: which }, screen.kind === "level" || screen.kind === "daily");

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

  const sharedLevel = useMemo(() => (screen.kind === "shared" ? decodeLevel(screen.code) : null), [screen]);
  useEffect(() => {
    if (screen.kind === "shared" && !sharedLevel) {
      try {
        window.history.replaceState({ screen: LIST }, "", location.pathname + location.search);
      } catch {
        /* as above */
      }
      setScreen(LIST);
      setNotice("That link doesn’t hold a coop this game can read. Check that all of it was copied.");
    }
  }, [screen, sharedLevel]);

  const level = screen.kind === "level" ? LEVELS[screen.index] : screen.kind === "daily" ? daily : sharedLevel;
  const levelId = screen.kind === "level" || screen.kind === "daily" ? level?.id : undefined;
  const cleared = useCallback(
    (moves: number, solo: boolean) => {
      // Home-made coops are played for fun: they leave no record.
      if (!levelId) return;
      setProgress((p) => {
        const was = p[levelId];
        const now = better(was, solo ? { moves, solo } : { moves });
        if (was && was.moves === now.moves && was.solo === now.solo) return p;
        const next = { ...p, [levelId]: now };
        saveProgress(next);
        return next;
      });
    },
    [levelId],
  );

  const openCode = (text: string): boolean => {
    const code = findCode(text);
    if (!code || !decodeLevel(code)) return false;
    go({ kind: "shared", code });
    return true;
  };

  let view;
  if (screen.kind === "editor") {
    view = <Editor draft={draft} onDraft={setDraft} onBack={back} onPlay={(s: SharedLevel) => go({ kind: "shared", code: encodeLevel(s), test: true })} />;
  } else if (!level) {
    view = (
      <Home
        chapters={CHAPTERS}
        daily={daily}
        progress={progress}
        eggs={eggs}
        settings={settings}
        lastPlayed={lastPlayed}
        notice={notice}
        onPlay={play}
        onSettings={changeSettings}
        onProgress={changeProgress}
        onEditor={() => go({ kind: "editor" })}
        onCode={openCode}
      />
    );
  } else {
    const chapter = CHAPTERS.find((c) => c.levels.includes(level));
    const next = chapter && level.index + 1 < LEVELS.length ? level.index + 1 : null;
    view = (
      <Play
        key={level.id + (screen.kind === "shared" ? screen.code : "")}
        level={level}
        where={chapter ? `${chapter.name}, ${chapter.levels.indexOf(level) + 1} of ${chapter.levels.length}` : screen.kind === "shared" && screen.test ? "Testing your coop" : level.chapter}
        best={levelId ? progress[levelId] : undefined}
        settings={settings}
        eggs={eggs}
        backLabel={screen.kind === "shared" && screen.test ? "Editor" : "Levels"}
        onCleared={cleared}
        onNext={next === null ? null : () => play(next)}
        onLevels={back}
      />
    );
  }
  return <HatContext.Provider value={hat}>{view}</HatContext.Provider>;
}
