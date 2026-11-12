// The whole game model. Plain data, no React, no timers.

export type Color = "red" | "gold" | "teal" | "blue" | "plum";
export type Dir = "up" | "down" | "left" | "right";
/** A railed hatch only slides along one axis. */
export type Axis = "h" | "v";

export const COLORS: Color[] = ["red", "gold", "teal", "blue", "plum"];
export const DIRS: Dir[] = ["up", "down", "left", "right"];
export const DELTA: Record<Dir, { dx: number; dy: number }> = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

/** A sliding trapdoor. It swallows `left` more chickens of its colour, then shuts and leaves the board. */
export interface Hatch {
  id: number;
  color: Color;
  /** Top-left corner of the box around the hatch. */
  x: number;
  y: number;
  /** Size of that box. */
  w: number;
  h: number;
  /** The squares the hatch covers, as [dx, dy] from its corner. Not every hatch is a rectangle. */
  cells: readonly (readonly [number, number])[];
  left: number;
  axis?: Axis;
  /** Frozen solid until this many chickens have dropped, anywhere on the board. */
  ice?: number;
  /** Padlocked: it will not budge until some hatch has picked up the key. */
  locked?: boolean;
}

export interface Chicken {
  id: number;
  color: Color;
  x: number;
  y: number;
  /** Still in its egg: its colour stays secret until a hatch slides up beside it. */
  hidden?: boolean;
}

/** How a level is written down in levels.ts. */
export interface LevelDef {
  name: string;
  /**
   * One string per row. `.` floor, `#` hay bale (never moves), `k` the key,
   * `r` `y` `t` `b` `p` a red, gold, teal, blue or plum chicken,
   * `R` `Y` `T` `B` `P` the same chicken still in its egg.
   */
  rows: string[];
  hatches: {
    color: Color;
    x: number;
    y: number;
    /** A rectangle this big (default 1 by 1)... */
    w?: number;
    h?: number;
    /** ...or any shape, drawn with `x` for covered squares: ["x.", "xx"] is an L. */
    shape?: string[];
    cap: number;
    axis?: Axis;
    ice?: number;
    locked?: boolean;
  }[];
  /** Fewest moves that clear the level, as found by the solver. Checked by the test suite. */
  par: number;
  /** One line shown under the board the first time a new idea appears. */
  tip?: string;
}

export interface Level {
  /** Position among all levels, from 0. */
  index: number;
  name: string;
  chapter: string;
  w: number;
  h: number;
  /** Row-major, true where a hay bale sits. */
  bales: boolean[];
  /** Where the key lies, if the level has one. */
  key: { x: number; y: number } | null;
  chickens: Chicken[];
  hatches: Hatch[];
  par: number;
  tip?: string;
}

export interface GameState {
  hatches: Hatch[];
  chickens: Chicken[];
  /** True once the key has been picked up (and from the start when there is no key). */
  keyTaken: boolean;
  /** A move is one unbroken run of sliding the same hatch. */
  moves: number;
  lastHatch: number | null;
}

export interface StepResult {
  state: GameState;
  /** Chickens that dropped on this step. */
  dropped: Chicken[];
  /** The hatch that filled up and shut on this step, if any (as it was just before shutting). */
  shut: Hatch | null;
  /** This step picked up the key. */
  tookKey: boolean;
}
