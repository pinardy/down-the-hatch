import { describe, expect, it } from "vitest";
import { dailyLevel } from "./daily";
import { betterResult, GAUNTLET_BOARDS, gauntletBudget, gauntletLevels, movesLeft, resultOf, runOver, shareText, weekKey, weekStart } from "./gauntlet";

describe("the weekly gauntlet", () => {
  const wed = new Date(2026, 10, 25, 9); // a Wednesday
  it("runs Monday to Sunday", () => {
    expect(weekKey(wed)).toBe("2026-11-23");
    expect(weekKey(new Date(2026, 10, 23, 0, 5))).toBe("2026-11-23");
    expect(weekKey(new Date(2026, 10, 29, 23, 55))).toBe("2026-11-23");
    expect(weekKey(new Date(2026, 10, 30, 0, 5))).toBe("2026-11-30");
    expect(weekStart(wed).getDay()).toBe(1);
  });
  it("is five boards, the same all week, gentlest first, and none of them a daily coop that week", () => {
    const boards = gauntletLevels(wed);
    expect(boards).toHaveLength(GAUNTLET_BOARDS);
    expect(gauntletLevels(new Date(2026, 10, 29, 20)).map((l) => l.chickens)).toEqual(boards.map((l) => l.chickens));
    expect(boards.map((l) => l.par)).toEqual([...boards.map((l) => l.par)].sort((a, b) => a - b));
    const dailies = Array.from({ length: 7 }, (_, i) => JSON.stringify(dailyLevel(new Date(2026, 10, 23 + i, 12)).chickens));
    for (const b of boards) expect(dailies).not.toContain(JSON.stringify(b.chickens));
    const next = gauntletLevels(new Date(2026, 11, 2, 12));
    expect(JSON.stringify(next.map((l) => l.chickens))).not.toBe(JSON.stringify(boards.map((l) => l.chickens)));
  });
  it("has a budget of the pars and a little over", () => {
    const boards = gauntletLevels(wed);
    expect(gauntletBudget(boards)).toBe(boards.reduce((n, l) => n + l.par, 0) + 5);
  });
  it("keeps count, and ranks results", () => {
    const run = { moves: [4, 6] };
    expect(resultOf(run)).toEqual({ cleared: 2, moves: 10 });
    expect(movesLeft(run, 30)).toBe(20);
    expect(runOver(run)).toBe(false);
    expect(runOver({ ...run, out: true })).toBe(true);
    expect(runOver({ moves: [1, 2, 3, 4, 5] })).toBe(true);
    expect(betterResult({ cleared: 3, moves: 30 }, { cleared: 2, moves: 10 })).toBe(true);
    expect(betterResult({ cleared: 3, moves: 30 }, { cleared: 3, moves: 25 })).toBe(false);
    expect(betterResult({ cleared: 1, moves: 9 }, null)).toBe(true);
  });
  it("shares without the boards", () => {
    const text = shareText({ cleared: 5, moves: 41 }, 45, wed, "https://example.org/");
    expect(text).toContain("🟩🟩🟩🟩🟩");
    expect(text).toContain("41 of 45 moves");
    expect(shareText({ cleared: 2, moves: 20 }, 45, wed, "x")).toContain("2 of 5 boards");
  });
});
