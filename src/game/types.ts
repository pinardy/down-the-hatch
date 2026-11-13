// The whole game model. Plain data, no React, no timers.

export type Color = "red" | "gold" | "teal" | "blue" | "plum";
/** What a chicken can be: one of the colours, or "any", a white chicken that will drop down any hatch. */
export type Feather = Color | "any";
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
  /** Chained to this other hatch (its id): the two slide together, or not at all, until one of them shuts. */
  link?: number;
}

export interface Chicken {
  id: number;
  color: Feather;
  x: number;
  y: number;
  /** Still in its egg: its colour stays secret until a hatch slides up beside it. */
  hidden?: boolean;
}

/** How a level is written down in levels.ts. */
export interface LevelDef {
  /** What saved progress is filed under. Never change it once a level has shipped; the name is free to change. */
  id: string;
  name: string;
  /**
   * One string per row. `.` floor, `#` hay bale (never moves), `k` the key,
   * `~` a cracked board (it holds until a hatch slides off it, then it is a hole for good),
   * `r` `y` `t` `b` `p` a red, gold, teal, blue or plum chicken, `w` a white one that any hatch takes,
   * `R` `Y` `T` `B` `P` `W` the same chicken still in its egg.
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
    /** Two hatches with the same tag here are chained together. */
    link?: string;
  }[];
  /** Fewest moves that clear the level, as found by the solver. Checked by the test suite. */
  par: number;
  /** One line shown under the board the first time a new idea appears. */
  tip?: string;
}

export interface Level {
  /** Position among all levels, from 0. */
  index: number;
  id: string;
  name: string;
  chapter: string;
  w: number;
  h: number;
  /** Row-major, true where a hay bale sits. */
  bales: boolean[];
  /** Row-major, true where the floor is a cracked board. */
  cracks: boolean[];
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
  /** Cracked boards that have given way, as row-major squares in ascending order. */
  broken: readonly number[];
  /** True once the key has been picked up (and from the start when there is no key). */
  keyTaken: boolean;
  /** A move is one unbroken run of sliding the same hatch (or the same chained pair). */
  moves: number;
  /** The hatch moved last; for a chained pair, the lower of their two ids. */
  lastHatch: number | null;
}

export interface StepResult {
  state: GameState;
  /** Chickens that dropped on this step. */
  dropped: Chicken[];
  /** Every hatch that slid on this step, where it ended up: one, or two when they are chained. */
  moved: Hatch[];
  /** Those of them that filled up and shut (as they were just before shutting). */
  shut: Hatch[];
  /** Cracked boards that gave way on this step, as row-major squares. */
  broke: number[];
  /** This step picked up the key. */
  tookKey: boolean;
}
