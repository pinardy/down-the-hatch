import { describe, expect, it } from "vitest";
import { better, decodeProgress, encodeProgress, mergeProgress } from "./storage";
import type { Progress } from "./storage";

describe("backup codes", () => {
  const progress: Progress = { "first-peck": { moves: 1, solo: true }, "red-rover": { moves: 9 }, "daily-2026-11-13": { moves: 14, solo: true } };

  it("round-trips progress through a code", () => {
    const code = encodeProgress(progress);
    expect(code).toMatch(/^DTH1\.[A-Za-z0-9_-]+$/);
    expect(decodeProgress(code)).toEqual(progress);
  });

  it("forgives stray spaces and line breaks from copying", () => {
    const code = encodeProgress(progress);
    expect(decodeProgress(`  ${code.slice(0, 12)}\n${code.slice(12)} `)).toEqual(progress);
  });

  it("refuses anything that is not a code", () => {
    expect(decodeProgress("")).toBeNull();
    expect(decodeProgress("hello")).toBeNull();
    expect(decodeProgress("DTH1.not base64!")).toBeNull();
    expect(decodeProgress("DTH1." + btoa(JSON.stringify({ "first-peck": -3 })))).toBeNull();
    expect(decodeProgress("DTH1." + btoa(JSON.stringify({ "Bad Id": 3 })))).toBeNull();
    expect(decodeProgress("DTH1." + btoa(JSON.stringify([1, 2])))).toBeNull();
  });
});

describe("merging progress", () => {
  it("keeps the fewest moves and any solo clear", () => {
    expect(better({ moves: 9 }, { moves: 7 })).toEqual({ moves: 7 });
    expect(better({ moves: 7, solo: true }, { moves: 9 })).toEqual({ moves: 7, solo: true });
    expect(better({ moves: 9, solo: true }, { moves: 7 })).toEqual({ moves: 7, solo: true });
    expect(better(undefined, { moves: 4 })).toEqual({ moves: 4 });
  });

  it("never loses a level from either side", () => {
    const merged = mergeProgress({ a: { moves: 5 }, b: { moves: 3 } }, { b: { moves: 2, solo: true }, c: { moves: 8 } });
    expect(merged).toEqual({ a: { moves: 5 }, b: { moves: 2, solo: true }, c: { moves: 8 } });
  });
});
