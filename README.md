# Down the Hatch

A sliding puzzle for your phone. Slide the hatches, drop the chickens, clear the coop.

**[Play it here](https://pinardy.github.io/down-the-hatch/)** — installable and works offline.

<img src="docs/screenshot.png" alt="A level of Down the Hatch: coloured hatches, chickens and hay bales on a wooden board" width="320">

## How to play

- Drag a hatch to slide it. It drops in any chickens **of its own colour** it passes over.
- Hay bales, other hatches and other-coloured chickens block the way.
- The number on a hatch is how many more chickens it can take. Full hatches leave the board.
- Drop every chicken to clear the level. Match the par (fewest moves) for three eggs.

A twelve-level tutorial, then four chapters that add L- and T-shaped hatches, frozen hatches, padlocks and mystery eggs, then five much harder chapters that take 18 to 34 moves a level. Each chapter is tagged Easy, Medium, Hard or Expert on the level list. Undo, Start over and Hint are always there.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # rules tests; every level is solved and its par checked
npm run build    # bundle to dist/
```

The game engine lives in `src/game/` (plain TypeScript, with a solver for par and hints), the React UI in `src/ui/`. See [docs/levels.md](docs/levels.md) to add or generate levels.

Pushes to `main` are tested, built and deployed to GitHub Pages by [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).
