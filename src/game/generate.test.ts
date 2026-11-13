import { describe, expect, it } from "vitest";
import { grow, TIERS } from "./generate";
import { parseLevel, startState } from "./engine";
import { solve } from "./solver";
import { ENDLESS } from "../ui/endless";

describe("growing levels for endless mode", () => {
  it("only names tiers that exist", () => {
    for (const plan of Object.values(ENDLESS)) for (const t of plan.tiers) expect(TIERS.some((x) => x.name === t), t).toBe(true);
  });
  it.each(Object.entries(ENDLESS))("grows a fair, solvable %s coop with the right par", (_, plan) => {
    let def = null;
    for (let seed = 1; !def && seed < 6; seed++) def = grow(plan.tiers[seed % plan.tiers.length], seed, 1500, plan.target);
    expect(def).not.toBeNull();
    const level = parseLevel(def!, 0);
    const r = solve(level, startState(level), 400_000);
    expect(r.status).toBe("solved");
    if (r.status === "solved") expect(r.moves).toBe(def!.par);
  }, 30_000);
});
