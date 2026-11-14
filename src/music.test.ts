import { describe, expect, it } from "vitest";
import { CHAPTERS } from "./game/levels";
import { compose, EIGHTHS, hz, moodFor, MOODS, phraseLength } from "./music";
import type { MoodName } from "./music";

/** A repeatable source of numbers from 0 up to 1. */
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}

const names = Object.keys(MOODS) as MoodName[];

describe("moods", () => {
  it.each(names)("%s is well formed", (name) => {
    const m = MOODS[name];
    expect(m.bars).toHaveLength(4);
    expect(m.bpm).toBeGreaterThanOrEqual(60);
    expect(m.bpm).toBeLessThanOrEqual(130);
    for (const bar of m.bars) {
      // bass low enough to sit under the tune, high enough for a phone speaker
      expect(bar.root).toBeGreaterThanOrEqual(36);
      expect(bar.root).toBeLessThanOrEqual(52);
      expect(bar.tones).toHaveLength(3);
    }
    expect(m.bass.every((e) => e >= 0 && e < EIGHTHS)).toBe(true);
    expect(m.rest.every((r) => r >= 0 && r < 1)).toBe(true);
  });

  it.each(names)("%s: chord tones belong to the mood's key (no clashes with the scale)", (name) => {
    // Every chord tone is a note of the scale, or one of the two notes a five-note scale leaves
    // out of its seven-note key: the fourth and the seventh above the major root.
    const m = MOODS[name];
    const key = new Set(m.scale.map((n) => n % 12));
    // A major pentatonic starts with a whole tone; a minor one starts a minor third below its major root.
    const majorRoot = m.scale[1] - m.scale[0] === 2 ? m.scale[0] : m.scale[0] + 3;
    key.add((majorRoot + 5) % 12);
    key.add((majorRoot + 11) % 12);
    for (const bar of m.bars) for (const t of [bar.root, ...bar.tones]) expect(key.has(t % 12), `${name}: note ${t}`).toBe(true);
  });
});

describe("composing a tune", () => {
  it.each(names)("%s: sixteen bars, chord tones on the beat, scale steps between", (name) => {
    const m = MOODS[name];
    const tune = compose(m, seeded(7));
    const phrase = phraseLength(m);
    expect(tune).toHaveLength(phrase * 4);
    tune.forEach((note, i) => {
      if (note === null) return;
      const bar = m.bars[Math.floor(i / EIGHTHS) % m.bars.length];
      if (i % 4 === 0) expect(bar.tones.map((t) => t + 12)).toContain(note);
      else expect(m.scale).toContain(note);
    });
    // enough notes to be a tune, enough rests to breathe
    const sounding = tune.filter((n) => n !== null).length / tune.length;
    expect(sounding).toBeGreaterThan(0.2);
    expect(sounding).toBeLessThan(0.85);
  });

  it("is A B A B', and B' ends the way A does", () => {
    const m = MOODS.morning;
    const tune = compose(m, seeded(3));
    const p = phraseLength(m);
    const [a, b, a2, b2] = [0, 1, 2, 3].map((k) => tune.slice(k * p, (k + 1) * p));
    expect(a2).toEqual(a);
    expect(b2.slice(0, p - EIGHTHS)).toEqual(b.slice(0, p - EIGHTHS));
    expect(b2.slice(p - EIGHTHS)).toEqual(a.slice(p - EIGHTHS));
  });

  it("gives the same tune for the same numbers, and a different one otherwise", () => {
    expect(compose(MOODS.dusk, seeded(1))).toEqual(compose(MOODS.dusk, seeded(1)));
    expect(compose(MOODS.dusk, seeded(1))).not.toEqual(compose(MOODS.dusk, seeded(2)));
  });
});

describe("the mood for a place", () => {
  it("gives every chapter a mood, with neighbouring medium chapters taking turns", () => {
    const moods = CHAPTERS.map((c, i) => moodFor({ kind: "level", difficulty: c.difficulty, chapter: i }));
    moods.forEach((m) => expect(names).toContain(m));
    expect(moods[0]).toBe("morning");
    const medium = CHAPTERS.map((c, i) => (c.difficulty === "Medium" ? moods[i] : null)).filter(Boolean);
    for (let i = 1; i < medium.length; i++) expect(medium[i]).not.toBe(medium[i - 1]);
    expect(moodFor({ kind: "level", difficulty: "Expert", chapter: 22 })).toBe("lantern");
  });
  it("has its own for the daily coop, endless coops and coops from friends", () => {
    expect(moodFor({ kind: "daily" })).toBe("market");
    expect(new Set((["easy", "medium", "hard"] as const).map((level) => moodFor({ kind: "endless", level }))).size).toBe(3);
    expect(names).toContain(moodFor({ kind: "coop" }));
  });
});

describe("pitch", () => {
  it("puts A above middle C at 440 Hz and an octave at double", () => {
    expect(hz(69)).toBe(440);
    expect(hz(81)).toBeCloseTo(880);
  });
});
