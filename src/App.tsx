import { useCallback, useEffect, useMemo, useState } from "react";
import { dailyLevel, dayKey } from "./game/daily";
import { CHAPTERS, LEVELS } from "./game/levels";
import { setSoundEnabled } from "./sfx";
import { Home } from "./ui/Home";
import { Play } from "./ui/Play";
import { better, loadProgress, loadSettings, saveProgress, saveSettings } from "./ui/storage";
import type { Progress, Settings } from "./ui/storage";

/** What is on screen: one of the numbered levels, today's daily coop, or (null) the level list. */
export type Playing = number | "daily" | null;

/**
 * Which level this entry in the browser's history is showing, or null for the level list.
 * Opening a level adds an entry, so the phone's back button returns to the list instead of
 * leaving the game. Where history is off limits (some preview frames) this is always null
 * and the game falls back to plain state.
 */
function levelInHistory(): Playing {
  try {
    const at = (window.history.state as { level?: unknown } | null)?.level;
    return at === "daily" || (typeof at === "number" && LEVELS[at]) ? at : null;
  } catch {
    return null;
  }
}

const ID_OF_NAME = Object.fromEntries(LEVELS.map((l) => [l.name, l.id]));

export default function App() {
  const [playing, setPlaying] = useState<Playing>(levelInHistory);
  const [lastPlayed, setLastPlayed] = useState<Playing>(playing);
  const [progress, setProgress] = useState(() => loadProgress(ID_OF_NAME));
  const [settings, setSettings] = useState(loadSettings);

  // Which day's coop is "today's". Looked at afresh whenever the level list comes up or the app
  // is brought back to the front, never in the middle of a level: midnight must not swap the board.
  const [today, setToday] = useState(() => dayKey(new Date()));
  useEffect(() => {
    if (playing !== null) return;
    const look = () => setToday(dayKey(new Date()));
    look();
    document.addEventListener("visibilitychange", look);
    return () => document.removeEventListener("visibilitychange", look);
  }, [playing]);
  // `today` is YYYY-MM-DD; build the date at noon so it is the same day in any time zone handling.
  const daily = useMemo(() => {
    const [y, m, d] = today.split("-").map(Number);
    return dailyLevel(new Date(y, m - 1, d, 12));
  }, [today]);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);
  // The stylesheet reads both of these off the root element.
  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
    root.classList.toggle("big-text", settings.bigText);
  }, [settings.theme, settings.bigText]);

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
      const at = levelInHistory();
      if (at !== null) setLastPlayed(at);
      setPlaying(at);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const play = (which: number | "daily") => {
    try {
      // From the list, a new entry; from one level to the next, the same entry, so back still means the list.
      if (playing === null) window.history.pushState({ level: which }, "");
      else window.history.replaceState({ level: which }, "");
    } catch {
      /* no history here: the Levels button still works */
    }
    setLastPlayed(which);
    setPlaying(which);
  };

  const toLevels = () => {
    if (levelInHistory() === null) return setPlaying(null);
    // Leave through history, so the entry for this level is not left behind for back to find.
    window.history.back();
    // If nothing is behind this entry (a restored tab, say) back does nothing: go to the list anyway.
    window.setTimeout(() => {
      if (levelInHistory() === null) return;
      try {
        window.history.replaceState(null, "");
      } catch {
        /* as above */
      }
      setPlaying(null);
    }, 400);
  };

  const level = playing === null ? null : playing === "daily" ? daily : LEVELS[playing];
  const levelId = level?.id;
  const cleared = useCallback(
    (moves: number, solo: boolean) => {
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

  if (!level) {
    return <Home chapters={CHAPTERS} daily={daily} progress={progress} settings={settings} lastPlayed={lastPlayed} onPlay={play} onSettings={changeSettings} onProgress={changeProgress} />;
  }
  const chapter = CHAPTERS.find((c) => c.levels.includes(level));
  const next = chapter && level.index + 1 < LEVELS.length ? level.index + 1 : null;

  return (
    <Play
      key={level.id}
      level={level}
      where={chapter ? `${chapter.name}, ${chapter.levels.indexOf(level) + 1} of ${chapter.levels.length}` : level.chapter}
      best={progress[level.id]}
      settings={settings}
      onCleared={cleared}
      onNext={next === null ? null : () => play(next)}
      onLevels={toLevels}
    />
  );
}
