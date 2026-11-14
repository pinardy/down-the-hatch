// The tunes, as data and arithmetic: no sound is made here (that is sfx.ts). Each mood is four
// chords, one to a bar, a five-note scale that sits well over all of them, a tempo and how
// busy the tune is. A tune is made up afresh from a mood whenever it is needed.

import type { Difficulty } from "./game/levels";

export type MoodName = "morning" | "meadow" | "stroll" | "market" | "dusk" | "lantern";

export interface Mood {
  /** Beats a minute. */
  bpm: number;
  /** One per bar: the bass note, and the chord tones the tune lands on (all MIDI numbers). */
  bars: { root: number; tones: number[] }[];
  /** The notes the tune steps through between chord tones. */
  scale: number[];
  /** The chance of a rest on a strong eighth (the beat) and on a weak one (the off-beat). */
  rest: [number, number];
  /** The eighths of the bar, 0 to 7, on which the bass sounds. */
  bass: number[];
  /** The waveforms for the tune and the bass. */
  voice: { tune: OscillatorType; bass: OscillatorType };
}

const chord = (root: number, third: 3 | 4) => ({ root, tones: [root + 12, root + 12 + third, root + 19] });
const major = (root: number) => chord(root, 4);
const minor = (root: number) => chord(root, 3);
/** A major pentatonic scale from this note, with the octave on top. */
const pentatonic = (from: number) => [0, 2, 4, 7, 9, 12].map((n) => from + n);
/** A minor pentatonic scale from this note, with the octave on top. */
const minorPentatonic = (from: number) => [0, 3, 5, 7, 10, 12].map((n) => from + n);

export const MOODS: Record<MoodName, Mood> = {
  // C major, unhurried: the main screen and the tutorial.
  morning: { bpm: 96, bars: [major(48), minor(45), major(41), major(43)], scale: pentatonic(72), rest: [0.25, 0.55], bass: [0, 4], voice: { tune: "sine", bass: "triangle" } },
  // G major, a little quicker and brighter.
  meadow: { bpm: 104, bars: [major(43), major(48), minor(40), major(38)], scale: pentatonic(67), rest: [0.2, 0.5], bass: [0, 4, 6], voice: { tune: "sine", bass: "triangle" } },
  // F major, an easy walk.
  stroll: { bpm: 88, bars: [major(41), major(48), minor(38), major(46)], scale: pentatonic(65), rest: [0.3, 0.6], bass: [0, 4], voice: { tune: "triangle", bass: "sine" } },
  // D major and bouncy: the daily coop.
  market: { bpm: 112, bars: [major(38), major(45), minor(47), major(43)], scale: pentatonic(74), rest: [0.2, 0.45], bass: [0, 3, 4, 7], voice: { tune: "sine", bass: "triangle" } },
  // A minor, slower: the hard chapters.
  dusk: { bpm: 84, bars: [minor(45), major(41), major(48), major(43)], scale: minorPentatonic(69), rest: [0.3, 0.6], bass: [0, 4], voice: { tune: "triangle", bass: "sine" } },
  // D minor, sparse and slow: the expert chapters.
  lantern: { bpm: 76, bars: [minor(38), major(46), minor(38), major(36)], scale: minorPentatonic(62), rest: [0.4, 0.7], bass: [0], voice: { tune: "sine", bass: "sine" } },
};

/** Eighth notes in a bar, and in one phrase of a mood (a bar for each chord). */
export const EIGHTHS = 8;
export const phraseLength = (mood: Mood) => mood.bars.length * EIGHTHS;

/**
 * A tune for a mood: one entry per eighth note, a MIDI number or null for a rest. It is two
 * phrases, A and B, played A B A B', where B' ends the way A does so the loop comes home.
 * On the beat it plays a tone of the bar's chord, an octave up; between beats, a step of the
 * scale. `rnd` gives numbers from 0 up to 1.
 */
export function compose(mood: Mood, rnd: () => number = Math.random): (number | null)[] {
  const pick = <T,>(xs: T[]) => xs[Math.floor(rnd() * xs.length)];
  const phrase = () =>
    mood.bars.flatMap((bar) =>
      Array.from({ length: EIGHTHS }, (_, i) => {
        if (rnd() < mood.rest[i % 2]) return null;
        return i % 4 === 0 ? pick(bar.tones) + 12 : pick(mood.scale);
      }),
    );
  const a = phrase();
  const b = phrase();
  const turn = a.length - EIGHTHS; // the last bar
  return [...a, ...b, ...a, ...b.slice(0, turn), ...a.slice(turn)];
}

/** Where the player is, as far as the music cares. */
export type Place = { kind: "level"; difficulty: Difficulty; chapter: number } | { kind: "daily" } | { kind: "endless"; level: "easy" | "medium" | "hard" } | { kind: "coop" };

/** The mood for a place. Medium chapters take turns between two, so neighbours sound different. */
export function moodFor(place: Place): MoodName {
  switch (place.kind) {
    case "daily":
      return "market";
    case "coop":
      return "stroll";
    case "endless":
      return place.level === "easy" ? "meadow" : place.level === "medium" ? "stroll" : "dusk";
    case "level":
      if (place.difficulty === "Easy") return "morning";
      if (place.difficulty === "Hard") return "dusk";
      if (place.difficulty === "Expert") return "lantern";
      return place.chapter % 2 ? "meadow" : "stroll";
  }
}

/** The pitch of a MIDI note, in hertz. */
export const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
