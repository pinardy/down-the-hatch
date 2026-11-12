// The levels, in chapters, easiest first. The first three are hand-made lessons; the rest
// were grown by `npm run levels` and picked by hand. `npm test` solves every one and checks
// its par.
//
// Grid key:  .  floor     #  hay bale     k  the key
//            r y t b p   a red, gold, teal, blue or plum chicken
//            R Y T B P   the same chicken still in its egg (colour hidden until a hatch is beside it)
// Hatches are listed separately and must sit on floor. Each colour needs exactly as many
// chickens as its hatches have room for (`cap`). A hatch is a `w` by `h` rectangle, or any
// `shape` drawn with x's; it can be on a rail (`axis`), frozen until `ice` chickens have
// dropped, or `locked` until a hatch slides over the key.

import { parseLevel } from "./engine";
import type { Level, LevelDef } from "./types";

const TUTORIAL: LevelDef[] = [
  {
    name: "First peck",
    tip: "Drag the hatch under the chickens.",
    rows: ["....", "..rr", "...."],
    hatches: [{ color: "red", x: 0, y: 1, cap: 2 }],
    par: 1,
  },
  {
    name: "Wrong feathers",
    tip: "A hatch only takes its own colour. Clear the blue chicken out of red’s way.",
    rows: [".brr", "#..."],
    hatches: [
      { color: "red", x: 0, y: 0, cap: 2 },
      { color: "blue", x: 3, y: 1, cap: 1 },
    ],
    par: 2,
  },
  {
    name: "Full house",
    tip: "The number is the room left. A full hatch shuts and gets out of the way.",
    rows: ["r...y", "##.##"],
    hatches: [
      { color: "gold", x: 2, y: 0, w: 2, cap: 1 },
      { color: "red", x: 2, y: 1, cap: 1 },
    ],
    par: 2,
  },
  {
    name: "Side door",
    tip: "A long hatch drops chickens with any part of itself.",
    rows: ["..bt", "...b", "..t.", "...#", "...t"],
    hatches: [
      { color: "blue", x: 1, y: 2, h: 2, cap: 2 },
      { color: "teal", x: 0, y: 1, w: 2, cap: 3 },
    ],
    par: 4,
  },
  {
    name: "Pecking order",
    tip: "Two red hatches share the red chickens. Which one takes which matters.",
    rows: ["..tr", "#..r", "r...", "...t"],
    hatches: [
      { color: "teal", x: 0, y: 0, w: 2, cap: 2 },
      { color: "red", x: 1, y: 1, w: 2, cap: 2 },
      { color: "red", x: 2, y: 2, h: 2, cap: 1 },
    ],
    par: 4,
  },
  {
    name: "Scratch patch",
    rows: [".y..", "....", "rr.#", "ry.r", "y..."],
    hatches: [
      { color: "red", x: 2, y: 0, w: 2, cap: 2 },
      { color: "gold", x: 0, y: 1, w: 2, cap: 3 },
      { color: "red", x: 2, y: 4, w: 2, cap: 2 },
    ],
    par: 5,
  },
  {
    name: "Hay fever",
    rows: ["..#..", ".....", ".ybb.", "by#y.", "y...."],
    hatches: [
      { color: "blue", x: 2, y: 4, w: 2, cap: 3 },
      { color: "gold", x: 1, y: 1, w: 2, cap: 2 },
      { color: "gold", x: 4, y: 0, h: 2, cap: 2 },
    ],
    par: 7,
  },
  {
    name: "Red rover",
    rows: ["...r.", "..brr", ".....", "r...b", ".rb.r"],
    hatches: [
      { color: "red", x: 1, y: 1, h: 2, cap: 3 },
      { color: "blue", x: 0, y: 0, w: 3, cap: 3 },
      { color: "red", x: 1, y: 3, w: 3, cap: 3 },
    ],
    par: 7,
  },
  {
    name: "Tight squeeze",
    rows: [".....", ".b...", ".p...", "rbp..", "..#.."],
    hatches: [
      { color: "plum", x: 4, y: 3, h: 2, cap: 1 },
      { color: "blue", x: 3, y: 2, h: 3, cap: 2 },
      { color: "red", x: 4, y: 0, h: 2, cap: 1 },
      { color: "plum", x: 2, y: 1, w: 2, cap: 1 },
    ],
    par: 8,
  },
  {
    name: "On the rails",
    tip: "Arrowheads mean a hatch is on rails. It only slides that way.",
    rows: [".y..y", "...y.", "....b", "..r..", ".r.t.", "..#.r"],
    hatches: [
      { color: "red", x: 2, y: 0, w: 2, cap: 3 },
      { color: "gold", x: 0, y: 0, h: 2, cap: 3 },
      { color: "teal", x: 1, y: 1, h: 2, cap: 1 },
      { color: "blue", x: 0, y: 2, h: 2, cap: 1, axis: "h" },
    ],
    par: 10,
  },
  {
    name: "Square meal",
    rows: ["..#.#", ".rpy.", "t....", ".....", ".....", ".p.r."],
    hatches: [
      { color: "plum", x: 1, y: 2, w: 2, h: 2, cap: 2 },
      { color: "teal", x: 2, y: 4, w: 3, cap: 1 },
      { color: "red", x: 4, y: 2, h: 2, cap: 2 },
      { color: "gold", x: 0, y: 4, w: 2, cap: 1 },
    ],
    par: 11,
  },
  {
    name: "Rush hour at the roost",
    rows: ["p#rt..", "..p.b.", ".....#", "..r...", "......", "..##.t"],
    hatches: [
      { color: "red", x: 0, y: 1, w: 2, h: 2, cap: 2 },
      { color: "plum", x: 5, y: 3, cap: 2 },
      { color: "blue", x: 0, y: 3, h: 3, cap: 1 },
      { color: "teal", x: 2, y: 2, w: 2, cap: 1 },
      { color: "teal", x: 1, y: 4, w: 3, cap: 1 },
    ],
    par: 17,
  },
];

const SHAPES: LevelDef[] = [
  {
    name: "Elbow room",
    tip: "A bent hatch needs room for every corner, and drops chickens with any square.",
    rows: [".....", ".....", "r...b", "....."],
    hatches: [
      { color: "red", x: 0, y: 0, shape: ["x.", "xx"], cap: 1 },
      { color: "blue", x: 2, y: 0, shape: ["xxx", ".x."], cap: 1 },
    ],
    par: 2,
  },
  {
    name: "Dog-leg",
    rows: ["b.y.#.", "......", ".....#", "....p.", "....p.", "brb..."],
    hatches: [
      { color: "red", x: 2, y: 1, shape: [".x", "xx"], cap: 1 },
      { color: "gold", x: 2, y: 3, shape: [".x", "xx", ".x"], cap: 1 },
      { color: "plum", x: 1, y: 3, h: 2, cap: 2 },
      { color: "blue", x: 0, y: 1, shape: ["x.", "xx", "x."], cap: 3 },
    ],
    par: 14,
  },
  {
    name: "Tee time",
    rows: ["....y", "...t.", ".b...", ".....", "yb...", "tbb.."],
    hatches: [
      { color: "blue", x: 3, y: 3, shape: ["x.", "x.", "xx"], cap: 2 },
      { color: "teal", x: 1, y: 2, shape: [".x", "xx"], cap: 2 },
      { color: "gold", x: 3, y: 1, shape: [".x", "xx", ".x"], cap: 2 },
      { color: "blue", x: 1, y: 0, shape: ["xxx", ".x."], cap: 2 },
    ],
    par: 15,
  },
  {
    name: "Crooked row",
    rows: ["....#.", "...ppp", "......", "pt...p", "##....", "...rrp"],
    hatches: [
      { color: "teal", x: 3, y: 2, shape: ["xx", "x."], cap: 1 },
      { color: "red", x: 2, y: 0, shape: ["xx", "x.", "x."], cap: 2 },
      { color: "plum", x: 0, y: 5, w: 2, cap: 2 },
      { color: "plum", x: 2, y: 3, h: 2, cap: 2 },
      { color: "plum", x: 0, y: 1, shape: ["x.", "xx"], cap: 2 },
    ],
    par: 16,
  },
  {
    name: "Boxed in",
    rows: ["..bp.y", "#....y", "#.....", "yy...#", "b.....", ".p...b"],
    hatches: [
      { color: "gold", x: 1, y: 2, shape: ["xx", ".x"], cap: 2 },
      { color: "blue", x: 3, y: 0, shape: [".x", "xx"], cap: 3 },
      { color: "plum", x: 2, y: 4, shape: ["x..", "xxx"], cap: 2 },
      { color: "gold", x: 3, y: 2, shape: ["xx", ".x", ".x"], cap: 2 },
    ],
    par: 18,
  },
];

const ICE: LevelDef[] = [
  {
    name: "First frost",
    tip: "A frozen hatch shows how many chickens must drop, anywhere, before it thaws.",
    rows: ["...r", "...b", "..b."],
    hatches: [
      { color: "red", x: 0, y: 0, w: 2, cap: 1, ice: 2 },
      { color: "blue", x: 0, y: 1, cap: 2 },
    ],
    par: 2,
  },
  {
    name: "Thin ice",
    rows: ["....b", ".r...", "#....", ".....", "r.tb.", "b...."],
    hatches: [
      { color: "teal", x: 1, y: 3, shape: ["xx", "x.", "x."], cap: 1 },
      { color: "blue", x: 2, y: 0, shape: ["x..", "xxx"], cap: 2, ice: 1 },
      { color: "red", x: 3, y: 5, w: 2, cap: 2, ice: 2 },
      { color: "blue", x: 2, y: 2, shape: ["xx", ".x"], cap: 1 },
    ],
    par: 12,
  },
  {
    name: "Cold shoulder",
    rows: ["..b...", ".tr...", "b#....", "#.....", "......", ".yby.."],
    hatches: [
      { color: "red", x: 3, y: 3, w: 3, cap: 1 },
      { color: "gold", x: 0, y: 3, shape: ["..x", "xxx"], cap: 2 },
      { color: "teal", x: 4, y: 0, shape: ["x.", "xx"], cap: 1, ice: 3 },
      { color: "blue", x: 3, y: 1, h: 2, cap: 3 },
    ],
    par: 13,
  },
  {
    name: "Black ice",
    rows: ["....t", ".byr#", "tb..t", "t...r", "..t..", "..ryt"],
    hatches: [
      { color: "blue", x: 2, y: 2, w: 2, cap: 2, ice: 2 },
      { color: "red", x: 1, y: 3, shape: ["xxx", "..x"], cap: 3 },
      { color: "gold", x: 0, y: 4, shape: ["x.", "xx"], cap: 2 },
      { color: "teal", x: 2, y: 0, w: 2, cap: 3, ice: 2 },
      { color: "teal", x: 0, y: 0, h: 2, cap: 3 },
    ],
    par: 13,
  },
  {
    name: "Deep freeze",
    rows: ["......", ".....p", ".t..#.", ".....p", ".p...p", "rrt.r."],
    hatches: [
      { color: "red", x: 2, y: 2, shape: ["x..", "xxx"], cap: 3 },
      { color: "teal", x: 0, y: 2, shape: ["x.", "xx"], cap: 2 },
      { color: "plum", x: 1, y: 0, h: 2, cap: 2 },
      { color: "plum", x: 3, y: 0, shape: ["xx", "x."], cap: 2, ice: 1 },
    ],
    par: 14,
  },
];

const LOCKS: LevelDef[] = [
  {
    name: "Spare key",
    tip: "A padlocked hatch stays put until another hatch slides over the key.",
    rows: ["...r", ".k.b"],
    hatches: [
      { color: "red", x: 0, y: 0, cap: 1, locked: true },
      { color: "blue", x: 0, y: 1, cap: 1 },
    ],
    par: 2,
  },
  {
    name: "Latchkey",
    rows: ["y.t.#t", ".#t.#.", ".kb...", "b..y..", "...yb.", "...t.."],
    hatches: [
      { color: "blue", x: 5, y: 3, h: 3, cap: 3, locked: true },
      { color: "teal", x: 0, y: 3, shape: [".x", ".x", "xx"], cap: 2 },
      { color: "gold", x: 4, y: 2, w: 2, cap: 3 },
      { color: "teal", x: 2, y: 3, h: 3, cap: 2 },
    ],
    par: 10,
  },
  {
    name: "Under wraps",
    rows: ["...by", "#ykr#", ".t...", ".....", ".y..y", "rb.r#"],
    hatches: [
      { color: "gold", x: 2, y: 5, cap: 4, locked: true },
      { color: "red", x: 2, y: 4, w: 2, cap: 3 },
      { color: "teal", x: 0, y: 2, h: 2, cap: 1, axis: "h" },
      { color: "blue", x: 1, y: 2, shape: ["..x", "xxx"], cap: 2 },
    ],
    par: 12,
  },
  {
    name: "Key change",
    rows: [".brb..", ".....b", "yk....", "...y.r", "r..bt.", "#...yy"],
    hatches: [
      { color: "red", x: 5, y: 2, cap: 3, locked: true },
      { color: "gold", x: 0, y: 3, shape: ["xx", ".x", ".x"], cap: 4 },
      { color: "teal", x: 3, y: 2, shape: ["xx", ".x"], cap: 1 },
      { color: "blue", x: 1, y: 1, shape: ["xx", ".x", ".x"], cap: 4, locked: true },
    ],
    par: 12,
  },
  {
    name: "Jailbird",
    rows: ["......", "....#.", "k..y..", "y.pyp.", ".#.yt.", ".pp.yp"],
    hatches: [
      { color: "teal", x: 0, y: 0, shape: ["xxx", "x.."], cap: 1 },
      { color: "gold", x: 3, y: 0, w: 2, cap: 3, locked: true },
      { color: "plum", x: 2, y: 1, w: 2, cap: 5, locked: true },
      { color: "gold", x: 1, y: 1, h: 2, cap: 2 },
    ],
    par: 14,
  },
  {
    name: "Throw away the key",
    rows: ["...k..", "r..br.", "......", "..bt.y", "...y.r", "......"],
    hatches: [
      { color: "red", x: 4, y: 0, shape: ["xx", ".x", ".x"], cap: 3 },
      { color: "gold", x: 0, y: 2, h: 3, cap: 2 },
      { color: "teal", x: 1, y: 0, h: 3, cap: 1, locked: true },
      { color: "blue", x: 0, y: 3, shape: [".x", ".x", "xx"], cap: 2 },
    ],
    par: 15,
  },
];

const FLOCK: LevelDef[] = [
  {
    name: "Surprise inside",
    tip: "An egg hides its chicken’s colour. Slide a hatch up beside it to crack it open.",
    rows: ["..R.", "...B", "...."],
    hatches: [
      { color: "red", x: 0, y: 0, cap: 1 },
      { color: "blue", x: 0, y: 2, cap: 1 },
    ],
    par: 2,
  },
  {
    name: "Mixed clutch",
    rows: ["..ky..", ".Yrr..", "......", "b.Y...", "Y...y.", "...#..", "p.ry.."],
    hatches: [
      { color: "plum", x: 1, y: 4, w: 2, cap: 1 },
      { color: "blue", x: 2, y: 2, shape: ["xx", ".x"], cap: 1, ice: 2 },
      { color: "gold", x: 4, y: 1, shape: ["xx", "x."], cap: 3, ice: 1 },
      { color: "red", x: 4, y: 3, shape: [".x", ".x", "xx"], cap: 3, locked: true },
      { color: "gold", x: 0, y: 1, shape: ["x.", "xx"], cap: 3 },
    ],
    par: 14,
  },
  {
    name: "Henhouse blues",
    rows: [".....B", "......", ".Y...b", "#k....", "B.....", ".p.t.y", ".B..T."],
    hatches: [
      { color: "blue", x: 3, y: 4, shape: ["xxx", ".x."], cap: 2, locked: true },
      { color: "teal", x: 3, y: 1, shape: ["xxx", ".x."], cap: 2 },
      { color: "plum", x: 0, y: 1, h: 2, cap: 1, ice: 1, locked: true },
      { color: "gold", x: 2, y: 0, shape: ["xxx", "x.."], cap: 2 },
      { color: "blue", x: 1, y: 3, shape: [".x", "xx"], cap: 2, ice: 1 },
    ],
    par: 14,
  },
  {
    name: "All cooped up",
    rows: ["r..pr#", ".t...#", "..r.pR", ".B...k", "..r...", ".#RrRb"],
    hatches: [
      { color: "red", x: 3, y: 1, shape: ["xx", "x."], cap: 4, ice: 1, locked: true },
      { color: "teal", x: 3, y: 4, w: 3, cap: 1 },
      { color: "plum", x: 0, y: 2, shape: ["x.", "x.", "xx"], cap: 2, ice: 5, locked: true },
      { color: "blue", x: 3, y: 3, w: 2, cap: 2 },
      { color: "red", x: 2, y: 0, h: 2, cap: 4, locked: true },
    ],
    par: 18,
  },
  {
    name: "Last one out",
    rows: [".Y#...", "...krp", "..Y..b", ".r....", ".R..y#", "...tB#"],
    hatches: [
      { color: "blue", x: 3, y: 2, shape: [".x", "xx"], cap: 2 },
      { color: "teal", x: 0, y: 3, shape: ["x.", "x.", "xx"], cap: 1, ice: 1 },
      { color: "gold", x: 2, y: 3, shape: ["x.", "xx", "x."], cap: 3 },
      { color: "red", x: 4, y: 0, w: 2, cap: 3, ice: 1, locked: true },
      { color: "plum", x: 0, y: 0, shape: ["x.", "xx", "x."], cap: 1 },
    ],
    par: 20,
  },
];

export interface Chapter {
  name: string;
  /** One line under the chapter's name on the level list. */
  blurb: string;
  levels: Level[];
}

const BOOK: { name: string; blurb: string; levels: LevelDef[] }[] = [
  { name: "Tutorial", blurb: "The rules, one at a time.", levels: TUTORIAL },
  { name: "Bent out of shape", blurb: "Hatches with corners, and less room to turn them.", levels: SHAPES },
  { name: "Cold snap", blurb: "Frozen hatches thaw only when enough chickens have dropped.", levels: ICE },
  { name: "Lock-up", blurb: "Padlocked hatches wait for the key.", levels: LOCKS },
  { name: "The whole flock", blurb: "Everything at once, and eggs that keep their colour secret.", levels: FLOCK },
];

let count = 0;
export const CHAPTERS: Chapter[] = BOOK.map((c) => ({ name: c.name, blurb: c.blurb, levels: c.levels.map((d) => parseLevel(d, count++, c.name)) }));

/** Every level in order. */
export const LEVELS: Level[] = CHAPTERS.flatMap((c) => c.levels);
