import { useCallback, useEffect, useState } from "react";
import { CHAPTERS, LEVELS } from "./game/levels";
import { setSoundEnabled } from "./sfx";
import { Home } from "./ui/Home";
import { Play } from "./ui/Play";
import { loadProgress, loadSettings, saveProgress, saveSettings } from "./ui/storage";
import type { Settings } from "./ui/storage";

export default function App() {
  const [playing, setPlaying] = useState<number | null>(null);
  const [progress, setProgress] = useState(loadProgress);
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

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

  if (!level) return <Home chapters={CHAPTERS} progress={progress} settings={settings} onPlay={setPlaying} onSettings={changeSettings} />;
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
      onNext={level.index + 1 < LEVELS.length ? () => setPlaying(level.index + 1) : null}
      onLevels={() => setPlaying(null)}
    />
  );
}
