// Endless mode: coops grown on the spot, at the difficulty the player picks. Growing happens in
// a worker; where one can't start it happens here instead (slower, but it works). The next coop
// starts growing as soon as one is handed out, so there is usually no wait.

import { grow } from "../game/generate";
import { encodeLevel } from "../game/share";
import type { GrowAnswer, GrowAsk } from "../game/generate.worker";
import type { LevelDef } from "../game/types";
import GrowWorker from "../game/generate.worker?worker&inline";

export type EndlessLevel = "easy" | "medium" | "hard";

export const ENDLESS: Record<EndlessLevel, { name: string; about: string; tiers: string[]; target: number; budgetMs: number }> = {
  easy: { name: "Easy", about: "Small yards, a few moves.", tiers: ["tiny", "small"], target: 5, budgetMs: 2500 },
  medium: { name: "Medium", about: "Bends, ice, padlocks, eggs and more.", tiers: ["medium", "shapes", "ice", "lock", "eggs", "crack", "wild", "link"], target: 8, budgetMs: 5000 },
  hard: { name: "Hard", about: "Paint, gates, one-way floors and mixed pieces.", tiers: ["mix", "paint", "gate", "arrow", "crack-ice", "link-shapes", "shapes"], target: 12, budgetMs: 8000 },
};

const FIRST = ["Busy", "Crowded", "Muddy", "Windy", "Sleepy", "Noisy", "Sunny", "Rainy", "Tangled", "Hidden", "Lucky", "Rickety", "Dusty", "Quiet", "Hungry", "Restless"];
const SECOND = ["roost", "yard", "barn", "coop", "pen", "run", "paddock", "henhouse", "loft", "orchard", "lane", "meadow", "hayloft", "corner", "patch", "shed"];

let worker: Worker | null | undefined;
let nextId = 0;
const waiting = new Map<number, (def: LevelDef | null) => void>();

function ask(q: Omit<GrowAsk, "id">): Promise<LevelDef | null> {
  if (worker === undefined) {
    try {
      worker = new GrowWorker();
      worker.onmessage = (e: MessageEvent<GrowAnswer>) => {
        waiting.get(e.data.id)?.(e.data.def);
        waiting.delete(e.data.id);
      };
      worker.onerror = () => {
        worker?.terminate();
        worker = null;
        for (const [, done] of waiting) done(null);
        waiting.clear();
      };
    } catch {
      worker = null;
    }
  }
  if (!worker) return new Promise((done) => window.setTimeout(() => done(grow(q.tier, q.seed, Math.min(q.budgetMs, 3000), q.target)), 0));
  const id = ++nextId;
  return new Promise((done) => {
    waiting.set(id, done);
    worker!.postMessage({ id, ...q } satisfies GrowAsk);
  });
}

/**
 * Grow one coop and write it as a share code (the same as a home-made one). Tries again if a
 * search finds nothing. `quick` halves the time, for when the player is waiting on it.
 */
async function growOne(level: EndlessLevel, quick = false): Promise<string> {
  const plan = ENDLESS[level];
  for (let attempt = 0; attempt < 4; attempt++) {
    const seed = Math.floor(Math.random() * 2 ** 31);
    const tier = plan.tiers[seed % plan.tiers.length];
    const def = await ask({ tier, seed, budgetMs: quick ? plan.budgetMs / 2 : plan.budgetMs, target: plan.target });
    if (!def) continue;
    const name = `${FIRST[seed % FIRST.length]} ${SECOND[(seed >> 4) % SECOND.length]}`;
    return encodeLevel({ name, rows: def.rows, hatches: def.hatches, par: def.par });
  }
  throw new Error("no coop grew");
}

const ahead = new Map<EndlessLevel, Promise<string>>();

/** A freshly grown coop at this difficulty. Starts growing the one after it straight away. */
export function nextCoop(level: EndlessLevel): Promise<string> {
  // Nothing grown ahead: the player is waiting, so grow this one quickly.
  const ready = ahead.get(level) ?? growOne(level, true);
  ahead.delete(level);
  void ready.then(
    () => ahead.set(level, growOne(level)),
    () => undefined,
  );
  return ready;
}

/** Start growing a coop before it is asked for, if one isn't already on the way. */
export function prepareCoop(level: EndlessLevel) {
  if (!ahead.has(level)) ahead.set(level, growOne(level));
}
