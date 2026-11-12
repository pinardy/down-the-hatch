// Progress and settings, kept in this browser. Every read and write is guarded:
// storage can be missing or full, and the game must still play.

export interface Settings {
  sound: boolean;
  /** Race a countdown on every level. Off by default: this is a thinking game. */
  clock: boolean;
}

/** Fewest moves used to clear each level, keyed by level name. */
export type Progress = Record<string, number>;

const SETTINGS_KEY = "down-the-hatch:settings:v1";
const PROGRESS_KEY = "down-the-hatch:progress:v1";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...(JSON.parse(raw) as T) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: carry on without saving */
  }
}

export const loadSettings = () => read<Settings>(SETTINGS_KEY, { sound: true, clock: false });
export const saveSettings = (s: Settings) => write(SETTINGS_KEY, s);
export const loadProgress = () => read<Progress>(PROGRESS_KEY, {});
export const saveProgress = (p: Progress) => write(PROGRESS_KEY, p);
