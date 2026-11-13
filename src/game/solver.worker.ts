// The solver, off the main thread. Hard levels can take a second or more to search, and the
// board must keep answering the finger while that happens.

import { lastWinnable, solve } from "./solver";
import type { SolveResult } from "./solver";
import type { GameState, Level } from "./types";

export type Ask =
  | { id: number; kind: "solve"; level: Level; state: GameState; maxStates: number }
  | { id: number; kind: "rewind"; level: Level; states: GameState[]; maxStates: number; known: (boolean | null)[]; deadlineMs: number };

export type Answer = { id: number; kind: "solve"; result: SolveResult } | { id: number; kind: "rewind"; index: number };

const scope = self as unknown as { onmessage: ((e: MessageEvent<Ask>) => void) | null; postMessage: (a: Answer) => void };

scope.onmessage = (e) => {
  const ask = e.data;
  if (ask.kind === "solve") scope.postMessage({ id: ask.id, kind: "solve", result: solve(ask.level, ask.state, ask.maxStates) });
  else scope.postMessage({ id: ask.id, kind: "rewind", index: lastWinnable(ask.level, ask.states, ask.maxStates, ask.known, ask.deadlineMs) });
};
