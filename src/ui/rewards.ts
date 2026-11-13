// What the game gives back: board themes and hats for the chickens. Nothing but looks. Each
// unlocks once enough of something has been earned, and stays chosen in settings:
//  - eggs, across the numbered levels;
//  - stars, for numbered levels cleared without a hint;
//  - daily coops cleared, on the day or later.

import { createContext, useContext } from "react";

export type BoardTheme = "barn" | "meadow" | "snowfall" | "moonlight" | "harvest" | "sunset";
export type Hat = "none" | "bow" | "straw" | "shades" | "crown" | "flower" | "party";

/** What a reward is paid for with. */
export type Currency = "eggs" | "stars" | "days";

export interface Reward {
  kind: "board" | "hat";
  id: BoardTheme | Hat;
  name: string;
  by: Currency;
  /** How many of them it needs. */
  need: number;
}

/** Everything earned so far. */
export interface Tally {
  eggs: number;
  stars: number;
  days: number;
}

export const REWARDS: Reward[] = [
  { kind: "board", id: "barn", name: "Barn", by: "eggs", need: 0 },
  { kind: "hat", id: "none", name: "Bare head", by: "eggs", need: 0 },
  { kind: "hat", id: "bow", name: "Bow", by: "eggs", need: 25 },
  { kind: "board", id: "meadow", name: "Meadow", by: "eggs", need: 75 },
  { kind: "hat", id: "straw", name: "Straw hat", by: "eggs", need: 125 },
  { kind: "board", id: "snowfall", name: "Snowfall", by: "eggs", need: 200 },
  { kind: "hat", id: "shades", name: "Shades", by: "eggs", need: 275 },
  { kind: "board", id: "moonlight", name: "Moonlight", by: "eggs", need: 350 },
  { kind: "hat", id: "crown", name: "Crown", by: "eggs", need: 425 },
  { kind: "hat", id: "flower", name: "Daisy", by: "stars", need: 20 },
  { kind: "board", id: "harvest", name: "Harvest", by: "stars", need: 60 },
  { kind: "hat", id: "party", name: "Party hat", by: "days", need: 5 },
  { kind: "board", id: "sunset", name: "Sunset", by: "days", need: 20 },
];

export const CURRENCY: Record<Currency, { one: string; many: string }> = {
  eggs: { one: "egg", many: "eggs" },
  stars: { one: "star", many: "stars" },
  days: { one: "daily coop", many: "daily coops" },
};

export const isUnlocked = (r: Reward, tally: Tally) => tally[r.by] >= r.need;

/** The next reward still to earn with each currency, if any. */
export const nextReward = (by: Currency, tally: Tally) => REWARDS.filter((r) => r.by === by && !isUnlocked(r, tally)).sort((a, b) => a.need - b.need)[0];

/** Rewards earned by going from `before` to `after`. */
export const newlyUnlocked = (before: Tally, after: Tally) => REWARDS.filter((r) => !isUnlocked(r, before) && isUnlocked(r, after));

/** A chosen reward only shows while it is unlocked: erasing progress puts the defaults back. */
export function wearing<T extends string>(kind: Reward["kind"], chosen: T, tally: Tally, fallback: T): T {
  const r = REWARDS.find((x) => x.kind === kind && x.id === chosen);
  return r && isUnlocked(r, tally) ? chosen : fallback;
}

/** "Sunset board", "Party hat", "Bow". */
export const rewardName = (r: Reward) => (r.kind === "board" ? `${r.name} board` : r.name);

/** The hat every chicken on screen is wearing. */
export const HatContext = createContext<Hat>("none");
export const useHat = () => useContext(HatContext);
