import { describe, expect, it } from "vitest";
import { DAILY_INDEX, dailyId, dailyLevel, dailyStreak, dayKey } from "./daily";
import { DAILY_POOL } from "./daily-pool";
import { isWon, parseLevel, startState, step } from "./engine";
import { solve } from "./solver";

describe("daily coop", () => {
  const day = (y: number, m: number, d: number) => new Date(y, m - 1, d, 9, 30);

  it("names each day by the player's own calendar", () => {
    expect(dayKey(day(2026, 3, 7))).toBe("2026-03-07");
    expect(dailyId(day(2026, 11, 13))).toBe("daily-2026-11-13");
    expect(dayKey(new Date(2026, 0, 1, 0, 0, 1))).toBe("2026-01-01");
    expect(dayKey(new Date(2026, 0, 1, 23, 59, 59))).toBe("2026-01-01");
  });

  it("gives the same board all day and the next one tomorrow", () => {
    const morning = dailyLevel(new Date(2026, 10, 13, 0, 5));
    const night = dailyLevel(new Date(2026, 10, 13, 23, 55));
    const tomorrow = dailyLevel(day(2026, 11, 14));
    expect(night).toEqual(morning);
    expect(morning.id).toBe("daily-2026-11-13");
    expect(morning.index).toBe(DAILY_INDEX);
    expect(tomorrow.id).toBe("daily-2026-11-14");
    if (DAILY_POOL.length > 1) expect(tomorrow.chickens).not.toEqual(morning.chickens);
  });

  it("gets harder through the week, from Monday to Sunday", () => {
    // 2 November 2026 is a Monday. Check a run of weeks: within each, par never falls.
    expect(new Date(2026, 10, 2, 12).getDay()).toBe(1);
    for (let week = 0; week < 20; week++) {
      const pars = Array.from({ length: 7 }, (_, d) => dailyLevel(new Date(2026, 10, 2 + week * 7 + d, 12)).par);
      expect([...pars].sort((a, b) => a - b)).toEqual(pars);
    }
    const monday = dailyLevel(new Date(2026, 10, 2, 12)).par;
    const sunday = dailyLevel(new Date(2026, 10, 8, 12)).par;
    expect(sunday).toBeGreaterThan(monday);
  });

  it("does not repeat a weekday's board until that weekday has used all of its own", () => {
    const perDay = Math.floor(DAILY_POOL.length / 7);
    const mondays = new Set<string>();
    for (let week = 0; week < perDay; week++) {
      const l = dailyLevel(new Date(2026, 10, 2 + week * 7, 12));
      mondays.add(JSON.stringify([l.chickens, l.hatches, l.bales]));
    }
    expect(mondays.size).toBe(perDay);
  });

  it("counts a streak back from today, or from yesterday if today is still to play", () => {
    const today = day(2026, 3, 2); // the run crosses a month end
    const done = (...keys: string[]) => (id: string) => keys.map((k) => `daily-${k}`).includes(id);
    expect(dailyStreak(done(), today)).toBe(0);
    expect(dailyStreak(done("2026-03-02"), today)).toBe(1);
    expect(dailyStreak(done("2026-03-01", "2026-02-28"), today)).toBe(2);
    expect(dailyStreak(done("2026-03-02", "2026-03-01", "2026-02-28"), today)).toBe(3);
    expect(dailyStreak(done("2026-03-02", "2026-02-28"), today)).toBe(1); // a gap ends it
    expect(dailyStreak(done("2026-02-28"), today)).toBe(0); // missed yesterday
  });

  it("has enough boards for at least two months", () => {
    expect(DAILY_POOL.length).toBeGreaterThanOrEqual(60);
  });

  it.each(DAILY_POOL.map((def, i) => [i + 1, def] as const))("board %i is solvable at its par", (i, def) => {
    const level = parseLevel({ ...def, id: `pool-${i}`, name: `Pool ${i}` }, DAILY_INDEX);
    const r = solve(level, startState(level), 3_000_000);
    expect(r.status).toBe("solved");
    if (r.status !== "solved") return;
    expect(r.moves).toBe(level.par);
    let s = startState(level);
    for (const st of r.steps) s = step(level, s, st.hatch, st.dir)!.state;
    expect(isWon(s)).toBe(true);
  });
});

describe("daily coop timing", () => {
  it("counts down to the player's midnight", async () => {
    const { msUntilTomorrow, untilText, earlierDays, dayKey: key } = await import("./daily");
    expect(msUntilTomorrow(new Date(2026, 10, 13, 23, 0))).toBe(3_600_000);
    expect(untilText(3_600_000 + 12 * 60_000)).toBe("1h 12m");
    expect(untilText(30_000)).toBe("under a minute");
    expect(earlierDays(new Date(2026, 10, 1, 9), 2).map(key)).toEqual(["2026-10-31", "2026-10-30"]);
  });
});

describe("longest streak", () => {
  it("finds the longest run of consecutive days, across month ends", async () => {
    const { longestStreak } = await import("./daily");
    expect(longestStreak([])).toBe(0);
    expect(longestStreak(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-05", "2026-11-06"])).toBe(3);
    expect(longestStreak(["2026-11-05"])).toBe(1);
  });
});
