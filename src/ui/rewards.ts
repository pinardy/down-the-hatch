// What eggs buy: board themes and hats for the chickens. Nothing but looks. Each unlocks once
// enough eggs have been earned across the numbered levels, and stays chosen in settings.

import { createContext, useContext } from "react";

export type BoardTheme = "barn" | "meadow" | "snowfall" | "moonlight";
export type Hat = "none" | "bow" | "straw" | "shades" | "crown";

export interface Reward {
  kind: "board" | "hat";
  id: BoardTheme | Hat;
  name: string;
  /** Eggs needed. */
  eggs: number;
}

export const REWARDS: Reward[] = [
  { kind: "board", id: "barn", name: "Barn", eggs: 0 },
  { kind: "hat", id: "none", name: "Bare head", eggs: 0 },
  { kind: "hat", id: "bow", name: "Bow", eggs: 25 },
  { kind: "board", id: "meadow", name: "Meadow", eggs: 75 },
  { kind: "hat", id: "straw", name: "Straw hat", eggs: 125 },
  { kind: "board", id: "snowfall", name: "Snowfall", eggs: 200 },
  { kind: "hat", id: "shades", name: "Shades", eggs: 275 },
  { kind: "board", id: "moonlight", name: "Moonlight", eggs: 350 },
  { kind: "hat", id: "crown", name: "Crown", eggs: 425 },
];

export const isUnlocked = (r: Reward, eggs: number) => eggs >= r.eggs;

/** The next reward still to earn, if any. */
export const nextReward = (eggs: number) => REWARDS.find((r) => eggs < r.eggs);

/** Rewards earned by going from `before` eggs to `after`. */
export const newlyUnlocked = (before: number, after: number) => REWARDS.filter((r) => r.eggs > before && r.eggs <= after);

/** A chosen reward only shows while it is unlocked: erasing progress puts the defaults back. */
export function wearing<T extends string>(kind: Reward["kind"], chosen: T, eggs: number, fallback: T): T {
  const r = REWARDS.find((x) => x.kind === kind && x.id === chosen);
  return r && isUnlocked(r, eggs) ? chosen : fallback;
}

/** The hat every chicken on screen is wearing. */
export const HatContext = createContext<Hat>("none");
export const useHat = () => useContext(HatContext);
