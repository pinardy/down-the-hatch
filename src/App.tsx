import { useCallback, useEffect, useState } from "react";
import { CHAPTERS, LEVELS } from "./game/levels";
import { setSoundEnabled } from "./sfx";
import { Home } from "./ui/Home";
import { Play } from "./ui/Play";
import { loadProgress, loadSettings, saveProgress, saveSettings } from "./ui/storage";
import type { Settings } from "./ui/storage";

/**
 * Which level this entry in the browser's history is showing, or null for the level list.
 * Opening a level adds an entry, so the phone's back button returns to the list instead of
 * leaving the game. Where history is off limits (some preview frames) this is always null
 * and the game falls back to plain state.
 */
function levelInHistory(): number | null {
  try {
    const at = (window.history.state as { level?: unknown } | null)?.level;
    return typeof at === "number" && LEVELS[at] ? at : null;
  } catch {
    return null;
  }
}

export default function App() {
  const [playing, setPlaying] = useState<number | null>(levelInHistory);
  const [lastPlayed, setLastPlayed] = useState<number | null>(playing);
  const [progress, setProgress] = useState(loadProgress);
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

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

  const play = (index: number) => {
    try {
      // From the list, a new entry; from one level to the next, the same entry, so back still means the list.
      if (playing === null) window.history.pushState({ level: index }, "");
      else window.history.replaceState({ level: index }, "");
    } catch {
      /* no history here: the Levels button still works */
    }
    setLastPlayed(index);
    setPlaying(index);
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

  const changeSettings = (s: Settings) => {
    setSettings(s);
    saveSettings(s);
  };

  const level = playing === null ? null : LEVELS[playing];
  const levelName = level?.name;
  const cleared = useCallback(
    (moves: number) => {
      if (!levelName) return;
      setProgress((p) => {
        if (p[levelName] !== undefined && p[levelName] <= moves) return p;
        const next = { ...p, [levelName]: moves };
        saveProgress(next);
        return next;
      });
    },
    [levelName],
  );

  if (!level) return <Home chapters={CHAPTERS} progress={progress} settings={settings} lastPlayed={lastPlayed} onPlay={play} onSettings={changeSettings} />;
  const chapter = CHAPTERS.find((c) => c.levels.includes(level))!;

  return (
    <Play
      key={level.index}
      level={level}
      place={chapter.levels.indexOf(level) + 1}
      total={chapter.levels.length}
      best={progress[level.name]}
      settings={settings}
      onCleared={cleared}
      onNext={level.index + 1 < LEVELS.length ? () => play(level.index + 1) : null}
      onLevels={toLevels}
    />
  );
}
