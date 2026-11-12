# Down the Hatch

A sliding puzzle for your phone. Slide the hatches, drop the chickens, clear the coop.

Built with React and TypeScript as an installable, offline-capable PWA.

## How to play

- Drag a hatch and it glides with your finger: up, down, left or right, one direction at a time.
- A hatch slides freely over empty floor. Slide it under chickens of **its own colour** and they drop in.
- Hay bales, other hatches and chickens of any other colour are in the way.
- The number on a hatch is the room it has left. A full hatch shuts and leaves the board.
- Hatches with arrowheads on the frame are on rails and only slide that way.
- Drop every chicken to clear the level.

After the 12-level Tutorial, four harder chapters each add a piece:

- **Bent out of shape:** L- and T-shaped hatches. They need room for every corner, and drop chickens with any square.
- **Cold snap:** a frozen hatch cannot move until the number of chickens on its snowflake have dropped, anywhere on the board.
- **Lock-up:** a padlocked hatch cannot move until some other hatch slides over the key.
- **The whole flock:** all of the above, plus eggs. An egg is a chicken whose colour you cannot see until a hatch slides up beside it.

A move is one unbroken run of sliding the same hatch. Each level has a par, the fewest moves that clear it: match it for three eggs, come within two for two eggs.

**Undo** steps back one drag, **Start over** resets the level, and **Hint** shows the next move of a shortest solution. If you slide yourself into a position that can no longer be cleared, the game tells you. *Race the clock* (off by default) adds a countdown to every level.

Keyboard: Tab to a hatch, then the arrow keys slide it.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # rules tests, and every level solved by the solver and checked against its par
npm run build    # type-check and bundle to a single dist/index.html (+ dist/standalone.html)
npm run levels   # search for new levels (see below)
```

```
src/game/    the engine: plain TypeScript, no React, no timers
  types.ts     the data model
  engine.ts    the rules, as pure functions (state in, new state out)
  solver.ts    breadth-first solver: par, hints, and "can this still be won?"
  levels.ts    the levels, as small ASCII grids
src/ui/      React screens, the board, artwork, saved progress
src/sfx.ts   synthesized sound effects (Web Audio, nothing to download)
public/      PWA manifest, icons, service worker
scripts/     level search, and the post-build step that inlines the manifest and icons
```

`dist/index.html` links the real manifest and icons beside it, which is what you deploy (GitHub Pages, any static host). `dist/standalone.html` has them inlined so that one file can be shared or opened entirely on its own.

## Adding levels

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

`npm run levels` grows levels automatically: it builds random boards, then makes small changes (move a chicken, reshape a hatch, add a bale), keeping each change if the solver says the level is still winnable and needs at least as many moves. It prints the best as entries to paste into `levels.ts`. `npm run levels -- shapes 42 120` searches the `shapes` tier with seed 42 for 120 seconds. The tiers are `tiny`, `small`, `medium` and `large` (plain boards), then `shapes`, `ice`, `lock` and `mix`, which must use the harder pieces. Par is only a rough stand-in for difficulty, so play what it finds before keeping it.

## Not here yet

- Other obstacles from the genre: sand, bombs, portals, things that move on their own.
- Boosters and lives. There is undo, a hint and an optional clock instead.
- Sound and art beyond the synthesized effects and inline SVG.