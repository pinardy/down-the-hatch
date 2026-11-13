// Achievements: goals worked out from what is already saved, so there is nothing more to store
// and a restored backup brings them back too (all but the endless ones, which backups don't carry).

import { longestStreak } from "../game/daily";
import { eggsFor } from "../game/engine";
import type { Chapter } from "../game/levels";
import type { EndlessCount, Progress } from "./storage";

export interface Achievement {
  id: string;
  name: string;
  about: string;
  /** How far along: done when `have` reaches `need`. */
  have: number;
  need: number;
}

export function achievements(chapters: Chapter[], progress: Progress, endless: EndlessCount): Achievement[] {
  const levels = chapters.flatMap((c) => c.levels);
  const rec = (id: string) => progress[id];
  const cleared = levels.filter((l) => rec(l.id)).length;
  const eggs = levels.reduce((n, l) => n + (rec(l.id) ? eggsFor(rec(l.id).moves, l.par) : 0), 0);
  const count = (pick: (r: Progress[string]) => boolean | undefined) => levels.filter((l) => rec(l.id) && pick(rec(l.id))).length;
  /** The best any chapter has done by this measure, as a share of the chapter. */
  const bestChapter = (ok: (l: Chapter["levels"][number]) => boolean) => Math.max(0, ...chapters.map((c) => c.levels.filter(ok).length / c.levels.length));
  const dailies = Object.keys(progress).filter((id) => id.startsWith("daily-") && !progress[id].late).map((id) => id.slice(6));
  const tutorial = chapters[0];
  const chapterDone = chapters.filter((c) => c.levels.every((l) => rec(l.id))).length;
  const pct = (share: number) => Math.round(share * 100);

  return [
    { id: "hatchling", name: "Hatchling", about: `Clear the ${tutorial.name.toLowerCase()}.`, have: tutorial.levels.filter((l) => rec(l.id)).length, need: tutorial.levels.length },
    { id: "chapter", name: "Chapter and verse", about: "Clear every level of a chapter after the tutorial.", have: Math.min(1, chapters.slice(1).filter((c) => c.levels.every((l) => rec(l.id))).length), need: 1 },
    { id: "basket", name: "Full basket", about: "Three eggs on every level of a chapter.", have: pct(bestChapter((l) => !!rec(l.id) && eggsFor(rec(l.id).moves, l.par) === 3)), need: 100 },
    { id: "no-hands", name: "Look, no hints", about: "A star on every level of a chapter.", have: pct(bestChapter((l) => !!rec(l.id)?.solo)), need: 100 },
    { id: "halfway", name: "Halfway home", about: `Clear ${Math.round(levels.length / 2)} levels.`, have: Math.min(cleared, Math.round(levels.length / 2)), need: Math.round(levels.length / 2) },
    { id: "every-coop", name: "Every coop", about: "Clear every level.", have: cleared, need: levels.length },
    { id: "chapters", name: "Well read", about: "Clear every chapter.", have: chapterDone, need: chapters.length },
    { id: "egg-hunter", name: "Egg hunter", about: "Earn 300 eggs.", have: Math.min(eggs, 300), need: 300 },
    { id: "golden-goose", name: "Golden goose", about: "Earn every egg.", have: eggs, need: levels.length * 3 },
    { id: "clockwork", name: "Clockwork", about: "Beat the clock on 25 levels.", have: Math.min(count((r) => r.clock), 25), need: 25 },
    { id: "heat", name: "Feeling the heat", about: "Clear 10 levels in hard mode.", have: Math.min(count((r) => r.hard), 10), need: 10 },
    { id: "regular", name: "Regular", about: "Clear the daily coop 7 days in a row.", have: Math.min(longestStreak(dailies), 7), need: 7 },
    { id: "devoted", name: "Devoted", about: "Clear the daily coop 30 days in a row.", have: Math.min(longestStreak(dailies), 30), need: 30 },
    { id: "grower", name: "Green fingers", about: "Clear 10 endless coops.", have: Math.min(endless.easy + endless.medium + endless.hard, 10), need: 10 },
    { id: "deep-end", name: "The deep end", about: "Clear 5 hard endless coops.", have: Math.min(endless.hard, 5), need: 5 },
  ];
}
