import { decodeLevel, encodeLevel } from "./share";
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

describe("every tier endless mode draws on", () => {
  const tiers = [...new Set(Object.values(ENDLESS).flatMap((plan) => plan.tiers))];
  it.each(tiers)("%s grows a coop that survives being written as a share code", (tier) => {
    let def = null;
    for (let seed = 1; !def && seed < 8; seed++) def = grow(tier, seed, 1200, 6);
    expect(def).not.toBeNull();
    // As endless mode does it: everything but the id goes into the code.
    const { id: _id, ...coop } = def!;
    const back = decodeLevel(encodeLevel({ ...coop, name: "x" }));
    expect(back).not.toBeNull();
    const r = solve(back!, startState(back!), 400_000);
    expect(r.status).toBe("solved");
    if (r.status === "solved") expect(r.moves).toBe(def!.par);
  }, 60_000);
});
