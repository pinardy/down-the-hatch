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
