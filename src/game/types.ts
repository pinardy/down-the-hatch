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
  /** Mirrored with this other hatch (its id): when one slides, the other slides the opposite way, or neither does. */
  mirror?: number;
  /** Tired: how many more times it can be picked up for a move. */
  uses?: number;
}

export interface Chicken {
  id: number;
  color: Feather;
  x: number;
  y: number;
  /** Still in its egg: its colour stays secret until a hatch slides up beside it. */
  hidden?: boolean;
  /** Skittish: when a hatch stops right beside it, it hops one square the way that hatch moved, if it can. */
  skittish?: boolean;
  /** In the pecking order: it can only be taken once every chicken with a lower number has gone. */
  order?: number;
  /** Underneath another chicken on the same square: it waits until that one has gone and a hatch slides onto the square again. */
  under?: boolean;
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
   * `R` `Y` `T` `B` `P` `W` the same chicken still in its egg,
   * `1` `2` `3` `4` `5` a puddle of red, gold, teal, blue or plum paint (a hatch that slides onto it takes that colour),
   * `o` a pressure plate and `=` a gate square (gates can only be entered while a hatch stands on a plate),
   * `<` `>` `^` `v` a one-way square (a hatch can only slide onto it moving the way the arrow points),
   * `_` slippery floor (a hatch that slides onto it keeps going until something stops it),
   * `@` a crate (a hatch shoves it one square, onto plain empty floor),
   * `*` a turntable (a hatch that slides onto it turns a quarter, clockwise, about that square),
   * `(` and `)` the two ends of a burrow (a one-square hatch that goes in one comes out of the other),
   * `%` a lever (a move that slides onto it flips every door), `+` a door that starts shut, `-` one that starts open.
   */
  rows: string[];
  /** Chickens that are skittish, by where they start: [x, y]. */
  skittish?: [number, number][];
  /** The pecking order: chickens by where they start, the first to be taken first. */
  order?: [number, number][];
  /** A second chicken under the one on this square: [x, y, colour letter as in rows]. */
  under?: [number, number, string][];
  /** Fences on the right or bottom edge of a square: [x, y, "right" | "down"]. */
  fences?: [number, number, "right" | "down"][];
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
    /** Two hatches with the same tag here are mirrored. */
    mirror?: string;
    /** Tired: how many times it can be picked up for a move. */
    uses?: number;
  }[];
  /** Fewest moves that clear the level, as found by the solver. Checked by the test suite. */
  par: number;
  /** One line shown under the board the first time a new idea appears. */
  tip?: string;
  /** Show a hand making the first move, until the player has cleared the level once. */
  demo?: boolean;
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
  /** Row-major: the colour of the paint on each square, or null. */
  paint: (Color | null)[];
  /** Row-major, true where a pressure plate is. */
  plates: boolean[];
  /** Row-major, true where a gate square is. */
  gates: boolean[];
  /** Row-major: the only way a hatch may slide onto each square, or null where any way will do. */
  arrows: (Dir | null)[];
  /** Row-major, true where the floor is slippery. */
  slick: boolean[];
  /** Row-major, true where a turntable is. */
  turns: boolean[];
  /** The two ends of the burrow, as row-major squares, if the level has one. */
  burrow: [number, number] | null;
  /** Where each crate starts, as row-major squares; a crate's id is its place in this list. */
  crates: number[];
  /** Row-major, true where a lever is. */
  levers: boolean[];
  /** Row-major: a door that starts shut (true), one that starts open (false), or no door (null). */
  doors: (boolean | null)[];
  /** Row-major: a fence on the right edge of the square. */
  fenceRight: boolean[];
  /** Row-major: a fence on the bottom edge of the square. */
  fenceDown: boolean[];
  chickens: Chicken[];
  hatches: Hatch[];
  par: number;
  tip?: string;
  demo?: boolean;
}

export interface GameState {
  hatches: Hatch[];
  chickens: Chicken[];
  /** Cracked boards that have given way, as row-major squares in ascending order. */
  broken: readonly number[];
  /** Where each crate is now, as row-major squares, by crate id. */
  crates: readonly number[];
  /** The doors have been flipped an odd number of times: those that started shut are open, and the other way about. */
  flipped: boolean;
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
  /** Hatches that slid onto paint and changed colour on this step (as they are now). */
  painted: Hatch[];
  /** The gates opened or closed on this step. */
  gate: "opened" | "closed" | null;
  /** Crates shoved on this step: crate id, and the square it went from and to. */
  pushed: { id: number; from: number; to: number }[];
  /** Hatches that a turntable turned on this step (as they are now). */
  turned: Hatch[];
  /** A hatch went down the burrow and came out of the other end on this step. */
  burrowed: boolean;
  /** Squares slid on slippery floor after the first, this step (0 when it didn't slip). */
  slid: number;
  /** Skittish chickens that hopped away on this step (where they are now). */
  hopped: Chicken[];
  /** The doors flipped on this step. */
  flipped: boolean;
}
