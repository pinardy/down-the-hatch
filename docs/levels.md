# Adding levels

A level is an ASCII grid plus a list of hatches:

```ts
{
  id: "wrong-feathers",
  name: "Wrong feathers",
  rows: [".brr",      // . floor   # hay bale
         "#..."],     // r y t b p  a red, gold, teal, blue or plum chicken
  hatches: [
    { color: "red", x: 0, y: 0, cap: 2 },
    { color: "blue", x: 3, y: 1, cap: 1 },
  ],
  par: 2,
}
```

The `id` is what a player's saved progress is filed under. Give every level its own, and never change it once the level has shipped; the `name` can change freely.

More grid squares:

| Square | Meaning |
|---|---|
| `k` | the key |
| `~` | a cracked board: it holds while a hatch is on it, and is a hole for good once the hatch slides off |
| `w` | a white chicken, which drops down any hatch and takes up room in it |
| `R Y T B P W` | the same chickens, still in their eggs |

A hatch can also take:

| Field | Meaning |
|---|---|
| `w`, `h` | a rectangle that size (default 1 by 1) |
| `shape: ["x.", "xx"]` | any shape, drawn with `x` for covered squares (this one is an L) |
| `axis: "h"` or `"v"` | on a rail: slides sideways only, or up and down only (rectangles only) |
| `ice: 3` | frozen until 3 chickens have dropped |
| `locked: true` | padlocked until a hatch slides over the key |
| `link: "a"` | chained to the other hatch with the same tag: the two slide together, or not at all, until one shuts |

Levels live in chapters in `src/game/levels.ts`; add a level to a chapter's list, or add a chapter to `BOOK`.

The chickens must exactly fill the hatches: no colour may have more chickens than its hatches have room for, and white chickens make up the difference. `npm test` fails if a level cannot be solved or its `par` is not the true minimum, so you can write a level by hand, guess the par, and let the test tell you the real number.

## Generating levels

`npm run levels` grows levels automatically: it builds random boards, then makes small changes (move a chicken, reshape a hatch, add a bale), keeping each change if the solver says the level is still winnable and needs at least as many moves. It prints the best as entries to paste into `levels.ts`.

`npm run levels -- shapes 42 120` searches the `shapes` tier with seed 42 for 120 seconds. A fourth number stops each board at that par instead of the tier's own target, which is how to grow gentler levels: `npm run levels -- ice 42 120 7`.

| Tiers | What they grow |
|---|---|
| `tiny`, `small`, `medium`, `large` | plain boards of growing size |
| `shapes`, `ice`, `lock`, `eggs`, `crack`, `wild`, `link` | boards that must use one of the later pieces |
| `mix` | bends, ice, padlocks and eggs together |
| `xl`, `shapes-hard`, `ice-hard`, `lock-hard`, `mix-hard` | the same on bigger boards, climbed for much longer towards a par in the high twenties |
| `medley` | cracked boards, white chickens and a chain together, hard |

The hard tiers take about two minutes a board, so give them several minutes.

### Par is not difficulty

A long level is not always a hard one. Many boards the search finds need twenty moves and cannot go wrong: every position can still be won, so they are a chore, not a puzzle. So each board is also scored for **traps**: the search plays it carelessly half way, many times over, and reports how often that leaves a position that can no longer be won. Output is sorted by par and traps together, and the hard tiers spend extra time changing a finished board to set more traps without letting its par drop.

Prefer boards with traps, and play what the search finds before keeping it.

## The daily coop

The daily coop draws one board a day from `src/game/daily-pool.ts`. Nothing is fetched, so it works offline. Pool boards are written like levels but need no `id` or `name`.

The week has a shape: the pool is sorted by par and cut into seven bands, Monday's the easiest and Sunday's the hardest. Each weekday works through its own band, one board a week, then starts it again. With 102 boards that is 14 or 15 weeks before a weekday repeats.

To add boards, run a mid-difficulty tier (`medium`, `large`, `shapes`, `ice`, `lock`, `mix`, `eggs`, `crack`, `wild` or `link`) and paste the best into the pool, anywhere. Adding boards moves the bands, so which board falls on which day changes from then on, today's included. `npm test` solves every pool board and checks its par.

## Chapters

Each chapter in `BOOK` has a `difficulty` (`Easy`, `Medium`, `Hard` or `Expert`), shown as a tag beside its name on the level list. Chapters are folded on that list, so the tag and the tally are what a player sees first.
