// Ask the solver without freezing the board. Questions go to a worker; where a worker cannot
// be started (some preview frames, very old browsers) they are answered on the spot instead,
// which is slower to the touch but always works.

import { lastWinnable, solve } from "../game/solver";
import type { SolveResult } from "../game/solver";
import type { Answer, Ask } from "../game/solver.worker";
import type { GameState, Level } from "../game/types";
// Inlined into the bundle, so the game stays a single file.
import SolverWorker from "../game/solver.worker?worker&inline";

type Question = { kind: "solve"; level: Level; state: GameState; maxStates: number } | { kind: "rewind"; level: Level; states: GameState[]; maxStates: number };

let worker: Worker | null | undefined; // undefined: not tried yet, null: not available
let nextId = 0;
const waiting = new Map<number, { question: Question; done: (a: Answer) => void }>();

function answerHere(id: number, q: Question): Answer {
  return q.kind === "solve" ? { id, kind: "solve", result: solve(q.level, q.state, q.maxStates) } : { id, kind: "rewind", index: lastWinnable(q.level, q.states, q.maxStates) };
}

/** The worker died or never started: answer everything outstanding on the main thread, and stop using it. */
function giveUpOnWorker() {
  worker?.terminate();
  worker = null;
  for (const [id, job] of [...waiting]) {
    waiting.delete(id);
    job.done(answerHere(id, job.question));
  }
}

function ask(question: Question): Promise<Answer> {
  if (worker === undefined) {
    try {
      worker = new SolverWorker();
      worker.onmessage = (e: MessageEvent<Answer>) => {
        const job = waiting.get(e.data.id);
        waiting.delete(e.data.id);
        job?.done(e.data);
      };
      worker.onerror = giveUpOnWorker;
    } catch {
      worker = null;
    }
  }
  const id = ++nextId;
  return new Promise((done) => {
    if (!worker) return window.setTimeout(() => done(answerHere(id, question)), 0);
    waiting.set(id, { question, done });
    try {
      worker.postMessage({ id, ...question } satisfies Ask);
    } catch {
      giveUpOnWorker();
    }
  });
}

/** The fewest moves that clear the level from `state`, or word that there is no way. */
export async function solveInBackground(level: Level, state: GameState, maxStates: number): Promise<SolveResult> {
  const answer = await ask({ kind: "solve", level, state, maxStates });
  if (answer.kind !== "solve") throw new Error("solver answered the wrong question");
  return answer.result;
}

/** Which of `states` (oldest first) is the last that can still be won. */
export async function lastWinnableInBackground(level: Level, states: GameState[], maxStates: number): Promise<number> {
  const answer = await ask({ kind: "rewind", level, states, maxStates });
  if (answer.kind !== "rewind") throw new Error("solver answered the wrong question");
  return answer.index;
}
