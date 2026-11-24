import { describe, expect, it } from "vitest";
import { decodeLevel, encodeLevel, findCode } from "./share";
import type { SharedLevel } from "./share";

const coop: SharedLevel = {
  name: "Ça va, Hühner 🐔",
  rows: ["....", "..rr", "~.wk"],
  hatches: [
    { color: "red", x: 0, y: 1, cap: 2, link: "a" },
    { color: "blue", x: 0, y: 0, w: 2, cap: 1, link: "a", locked: true },
  ],
  par: 3,
};

describe("level codes", () => {
  it("round-trip a level, name and all", () => {
    const level = decodeLevel(encodeLevel(coop));
    expect(level).not.toBeNull();
    expect(level!.name).toBe(coop.name);
    expect(level!.par).toBe(3);
    expect(level!.hatches.map((t) => [t.color, t.link])).toEqual([
      ["red", 1],
      ["blue", 0],
    ]);
  });

  it("find the code inside a link, even split across lines", () => {
    const code = encodeLevel(coop);
    const link = `https://example.org/down-the-hatch/#play=${code}`;
    expect(findCode(link)).toBe(code);
    expect(decodeLevel(`${link.slice(0, 30)}\n${link.slice(30)}`)?.name).toBe(coop.name);
  });

  it("refuse codes that are damaged, unfair or too big", () => {
    const code = encodeLevel(coop);
    expect(decodeLevel("")).toBeNull();
    expect(decodeLevel("hello")).toBeNull();
    expect(decodeLevel(code.slice(0, -6))).toBeNull();
    expect(decodeLevel(encodeLevel({ ...coop, rows: ["....", "..rr", "~.rk"] }))).toBeNull(); // more red than room
    expect(decodeLevel(encodeLevel({ ...coop, par: 0 }))).toBeNull();
    expect(decodeLevel(encodeLevel({ ...coop, rows: coop.rows.map((r) => r + ".....") }))).toBeNull(); // 9 wide
  });
});

describe("sharing coops with the later pieces", () => {
  it("keeps slippery floor, crates, turntables, the burrow and skittish chickens", () => {
    const code = encodeLevel({ name: "All of them", rows: ["(._r.", "..@..", "*...)", ".r..."], hatches: [{ color: "red", x: 1, y: 0, cap: 2 }], par: 3, skittish: [[1, 3]] });
    const level = decodeLevel(code)!;
    expect(level.slick.filter(Boolean)).toHaveLength(1);
    expect(level.crates).toEqual([7]);
    expect(level.turns.filter(Boolean)).toHaveLength(1);
    expect(level.burrow).toEqual([0, 14]);
    expect(level.chickens.find((c) => c.x === 1 && c.y === 3)?.skittish).toBe(true);
    expect(level.chickens.find((c) => c.x === 3 && c.y === 0)?.skittish).toBeUndefined();
  });
  it("turns down a damaged list of skittish chickens", () => {
    const good = encodeLevel({ name: "x", rows: ["r.."], hatches: [{ color: "red", x: 2, y: 0, cap: 1 }], par: 1 });
    const raw = JSON.parse(atob(good.slice(6).replace(/-/g, "+").replace(/_/g, "/")));
    const bad = "DTHL1." + btoa(JSON.stringify({ ...raw, s: [["a", 1]] })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    expect(decodeLevel(bad)).toBeNull();
  });
});
