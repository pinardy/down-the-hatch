# Adding levels

A level is an ASCII grid plus a list of hatches:

```ts
{
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

More grid squares: `k` is the key, and an upper-case chicken (`R Y T B P`) is still in its egg. A hatch can also take:

| Field | Meaning |
|---|---|
| `w`, `h` | a rectangle that size (default 1 by 1) |
| `shape: ["x.", "xx"]` | any shape, drawn with `x` for covered squares (this one is an L) |
| `axis: "h"` or `"v"` | on a rail: slides sideways only, or up and down only (rectangles only) |
| `ice: 3` | frozen until 3 chickens have dropped |
| `locked: true` | padlocked until a hatch slides over the key |

Levels live in chapters in `src/game/levels.ts`; add a level to a chapter's list, or add a chapter to `BOOK`.

Each colour needs exactly as many chickens as its hatches have room for. `npm test` fails if a level cannot be solved or its `par` is not the true minimum, so you can write a level by hand, guess the par, and let the test tell you the real number.

## Generating levels

`npm run levels` grows levels automatically: it builds random boards, then makes small changes (move a chicken, reshape a hatch, add a bale), keeping each change if the solver says the level is still winnable and needs at least as many moves. It prints the best as entries to paste into `levels.ts`.

`npm run levels -- shapes 42 120` searches the `shapes` tier with seed 42 for 120 seconds. The tiers are `tiny`, `small`, `medium` and `large` (plain boards), then `shapes`, `ice`, `lock` and `mix`, which must use the harder pieces. Par is only a rough stand-in for difficulty, so play what it finds before keeping it.
