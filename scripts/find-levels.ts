// Level search. Builds random boards, then improves each one by small changes (move a
// chicken, reshape a hatch, drop in a hay bale, freeze or padlock a hatch...), keeping a
// change whenever the solver says the level is still winnable and needs at least as many
// moves as before. The best boards are printed as ready-to-paste entries for levels.ts.
//
//   npm run levels                      every tier, default seed, 60 s each
//   npm run levels -- shapes 42 120     the "shapes" tier, seed 42, 120 s
//   npm run levels -- ice 42 120 7      the same for "ice", but stop each board at par 7
//
// Tiers: tiny, small, medium, large (plain boards), shapes, ice, lock, mix (harder pieces),
// then xl, shapes-hard, ice-hard, lock-hard and mix-hard: the same on bigger boards, climbed
// for much longer towards a much higher par.
//
// Then eggs, crack, wild and link, one for each of the later pieces; crack-ice, wild-eggs,
// link-lock and link-shapes, which pair a later piece with an earlier one; and medley for all three.
//
// Last, paint, gate and arrow for the newest pieces (paint puddles, a gate held open by a
// pressure plate, one-way squares), and workshop, which puts all three on one big board.
//
// "Moves" here means the game's own count: how many times you have to change hatch. That is
// only a rough stand-in for difficulty: a long level is not always a hard one. So each board
// is also scored for traps: play it carelessly half way, many times over, and see how often
// that leaves a position that can no longer be won. Hard tiers go on to polish a finished
// board for more traps without letting its par drop. Still, curate by playing what this prints.

import { parseLevel } from "../src/game/engine";
import { mulberry32, build, mutate, par, traps, TIERS } from "../src/game/generate";
import type { Tier } from "../src/game/generate";
import type { Level, LevelDef } from "../src/game/types";

function show(def: LevelDef) {
  const lines = def.rows.map((r) => [...r]);
  const level = parseLevel(def, 0);
  for (const t of level.hatches) for (const [dx, dy] of t.cells) lines[t.y + dy][t.x + dx] = String(t.id);
  const notes = level.hatches.map((t) => `${t.id}=${t.color}×${t.left}${t.axis ? " rail-" + t.axis : ""}${t.ice ? " ice" + t.ice : ""}${t.locked ? " locked" : ""}${t.link !== undefined ? " chained" : ""}`).join(", ");
  return lines.map((l) => "      // " + l.join(" ")).join("\n") + `\n      // ${notes}`;
}

const [tierArg, seedArg, secondsArg, targetArg] = process.argv.slice(2);
const seed = Number(seedArg ?? 7);
const seconds = Number(secondsArg ?? 60);
const which = tierArg === undefined ? TIERS : TIERS.filter((t, i) => t.name === tierArg || String(i) === tierArg);

for (const chosen of which) {
  const tier: Tier = targetArg ? { ...chosen, target: Number(targetArg) } : chosen;
  const rnd = mulberry32(seed * 1000 + TIERS.indexOf(chosen));
  const until = Date.now() + seconds * 1000;
  const found: { def: LevelDef; explored: number; traps: number }[] = [];
  let climbs = 0;
  while (Date.now() < until) {
    const first = build(tier, rnd);
    let best = first && par(first, 40_000);
    if (!first || !best) continue;
    let draft = first;
    climbs++;
    const giveUp = Math.min(until, Date.now() + (tier.hard ? 90_000 : 45_000));
    const started = Date.now();
    for (let i = 0; i < (tier.hard ? 2500 : 400) && best.moves < tier.target && Date.now() < giveUp; i++) {
      // A hard board that is still easy after half a minute rarely gets there: start another.
      if (tier.hard && Date.now() - started > 30_000 && best.moves < tier.target / 2) break;
      const next = mutate(draft, tier, rnd);
      const scored = next && par(next, tier.hard ? 200_000 : 120_000);
      if (next && scored && scored.moves >= best.moves) {
        draft = next;
        best = scored;
      }
    }
    // Big boards need a deeper look to tell a lost position from a merely tangled one.
    const judge = (level: Level) => (tier.hard ? traps(level, rnd, 8, 120_000) : traps(level, rnd));
    let trapped = judge(best.level);
    if (tier.hard && best.moves >= tier.target / 2) {
      // Polish: keep any small change that sets more traps without letting the par drop.
      const polishUntil = Math.min(until + 30_000, Date.now() + 40_000);
      for (let i = 0; i < 300 && trapped < 0.75 && Date.now() < polishUntil; i++) {
        const next = mutate(draft, tier, rnd);
        const scored = next && par(next, 200_000);
        if (!next || !scored || scored.moves < best.moves) continue;
        const now = judge(scored.level);
        if (now < trapped) continue;
        draft = next;
        best = scored;
        trapped = now;
      }
    }
    found.push({ def: best.def, explored: best.explored, traps: trapped });
    console.error(`${tier.name}: board ${climbs} reached par ${best.def.par}, traps ${Math.round(trapped * 100)}%`);
  }
  // A long level that cannot go wrong is a chore; one that can is a puzzle.
  const worth = (f: { def: LevelDef; traps: number }) => f.def.par * (1 + f.traps);
  found.sort((a, b) => worth(b) - worth(a));
  console.log(`\n// ── ${tier.name}: ${climbs} boards grown in ${seconds} s (seed ${seed}) ──`);
  for (const f of found.slice(0, 12)) {
    console.log(`  // par ${f.def.par}, traps ${Math.round(f.traps * 100)}%, ${f.explored} positions searched`);
    console.log(show(f.def));
    console.log(
      `  { id: "untitled", name: "untitled", rows: ${JSON.stringify(f.def.rows)}, par: ${f.def.par}, hatches: [${f.def.hatches
        .map((t) => JSON.stringify(t).replace(/"(\w+)":/g, "$1: "))
        .join(", ")}] },`,
    );
  }
}
