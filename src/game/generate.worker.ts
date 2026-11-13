// The level grower, off the main thread: growing a coop takes a few seconds of solving, and the
// game must keep playing while the next one grows.

import { grow } from "./generate";
import type { LevelDef } from "./types";

export type GrowAsk = { id: number; tier: string; seed: number; budgetMs: number; target: number };
export type GrowAnswer = { id: number; def: LevelDef | null };

const scope = self as unknown as { onmessage: ((e: MessageEvent<GrowAsk>) => void) | null; postMessage: (a: GrowAnswer) => void };

scope.onmessage = (e) => {
  const { id, tier, seed, budgetMs, target } = e.data;
  scope.postMessage({ id, def: grow(tier, seed, budgetMs, target) });
};
