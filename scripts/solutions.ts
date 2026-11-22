// Works out the best solution of every numbered level and writes them to
// src/game/solutions.ts, for hints and "Watch the best solution" (see src/game/known.ts).
//
//   npm run solutions
//
// Run it after adding or changing levels; the tests fail until the stored solutions match.

import { writeFileSync } from "node:fs";
import { encodeSteps } from "../src/game/known";
import { LEVELS } from "../src/game/levels";
import { solve } from "../src/game/solver";

const lines: string[] = [];
for (const level of LEVELS) {
  const r = solve(level, undefined, 3_000_000);
  if (r.status !== "solved") throw new Error(`${level.id}: ${r.status}`);
  if (r.moves !== level.par) throw new Error(`${level.id}: solved in ${r.moves}, par is ${level.par}`);
  lines.push(`  ${JSON.stringify(level.id)}: ${JSON.stringify(encodeSteps(r.steps))},`);
}

const file = `// Written by \`npm run solutions\`: don't edit by hand. Each level's best solution, as in
// encodeSteps (src/game/known.ts): a hatch's id, then the way each square it slides.
export const SOLUTIONS: Record<string, string> = {
${lines.join("\n")}
};
`;
// Run from the project folder, as npm does.
writeFileSync("src/game/solutions.ts", file);
console.log(`wrote ${lines.length} solutions to src/game/solutions.ts`);
