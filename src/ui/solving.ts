// Ask the solver without freezing the board. Questions go to a worker; where a worker cannot
// be started (some preview frames, very old browsers) they are answered on the spot instead,
// which is slower to the touch but always works.
//
// The worker answers one question at a time, so they wait in a queue here. Two kinds:
//  - quiet ones, the check after each move that the level can still be won. Only the latest
//    matters: a newer one replaces any still waiting, and answers "unknown" for the old.
//  - ones the player is waiting on: a hint, a rewind, the best solution. These go ahead of
//    every quiet one, and if a quiet one is being worked on, the worker is stopped and started
//    afresh, so the player never waits behind a check nobody needs any more.

import { lastWinnable, solve } from "../game/solver";
import type { SolveResult } from "../game/solver";
import type { Answer, Ask } from "../game/solver.worker";
import type { GameState, Level } from "../game/types";
// Inlined into the bundle, so the game stays a single file.
import SolverWorker from "../game/solver.worker?worker&inline";

type Question =
  | { kind: "solve"; level: Level; state: GameState; maxStates: number }
  | { kind: "rewind"; level: Level; states: GameState[]; maxStates: number; known: (boolean | null)[]; deadlineMs: number };

interface Job {
  id: number;
  question: Question;
  quiet: boolean;
  done: (a: Answer) => void;
}

let worker: Worker | null | undefined; // undefined: not started yet, null: not available
let nextId = 0;
const queue: Job[] = [];
let busy: Job | null = null;

/**
 * Without a worker, questions are answered on the main thread, which holds up the board: a
 * quiet check gets a smaller search, and a rewind less time. A rewind cut short goes back
 * further than it need, but never into a dead end.
 */
const QUIET_HERE = 40_000;
const REWIND_TIME_HERE = 1_500;

function answerHere(job: Job): Answer {
  const q = job.question;
  if (q.kind === "solve") return { id: job.id, kind: "solve", result: solve(q.level, q.state, job.quiet ? Math.min(q.maxStates, QUIET_HERE) : q.maxStates) };
  return { id: job.id, kind: "rewind", index: lastWinnable(q.level, q.states, q.maxStates, q.known, Math.min(q.deadlineMs, REWIND_TIME_HERE)) };
}

/** The answer for a question that was dropped: nothing learned. */
const dropped = (job: Job): Answer => (job.question.kind === "solve" ? { id: job.id, kind: "solve", result: { status: "unknown", explored: 0 } } : { id: job.id, kind: "rewind", index: 0 });

function startWorker() {
  try {
    const w = new SolverWorker();
    w.onmessage = (e: MessageEvent<Answer>) => {
      if (w !== worker || busy?.id !== e.data.id) return; // from a worker since stopped
      const job = busy;
      busy = null;
      job.done(e.data);
      pump();
    };
    w.onerror = () => {
      if (w !== worker) return;
      // The worker failed: from now on, answer here.
      w.terminate();
      worker = null;
      if (busy) queue.unshift(busy);
      busy = null;
      pump();
    };
    worker = w;
  } catch {
    worker = null;
  }
}

/** Hand the next question to the worker, or answer it here. */
function pump() {
  if (busy || !queue.length) return;
  if (worker === undefined) startWorker();
  const job = queue.shift()!;
  busy = job;
  if (!worker) {
    // On the main thread: after a pause, so "Thinking…" can show first.
    window.setTimeout(() => {
      busy = null;
      job.done(answerHere(job));
      pump();
    }, 30);
    return;
  }
  try {
    worker.postMessage({ id: job.id, ...job.question } satisfies Ask);
  } catch {
    worker.terminate();
    worker = null;
    busy = null;
    queue.unshift(job);
    pump();
  }
}

function ask(question: Question, quiet: boolean): Promise<Answer> {
  return new Promise((done) => {
    const job: Job = { id: ++nextId, question, quiet, done };
    if (quiet) {
      // Only the newest check matters.
      for (let i = queue.length - 1; i >= 0; i--) {
        if (!queue[i].quiet) continue;
        const old = queue.splice(i, 1)[0];
        old.done(dropped(old));
      }
      queue.push(job);
    } else {
      // Ahead of every quiet check, and stop one already running.
      if (busy?.quiet && worker) {
        worker.terminate();
        const stale = busy;
        busy = null;
        startWorker();
        stale.done(dropped(stale));
      }
      const firstQuiet = queue.findIndex((j) => j.quiet);
      queue.splice(firstQuiet < 0 ? queue.length : firstQuiet, 0, job);
    }
    pump();
  });
}

/** The fewest moves that clear the level from `state`, or word that there is no way. `quiet` for the check after each move. */
export async function solveInBackground(level: Level, state: GameState, maxStates: number, quiet = false): Promise<SolveResult> {
  const answer = await ask({ kind: "solve", level, state, maxStates }, quiet);
  if (answer.kind !== "solve") throw new Error("solver answered the wrong question");
  return answer.result;
}

/**
 * Which of `states` (oldest first) is the last that can still be won. `known` gives answers
 * already found for some of them; past `deadlineMs` it settles for the latest one proved.
 */
export async function lastWinnableInBackground(level: Level, states: GameState[], maxStates: number, known: (boolean | null)[], deadlineMs: number): Promise<number> {
  const answer = await ask({ kind: "rewind", level, states, maxStates, known, deadlineMs }, false);
  if (answer.kind !== "rewind") throw new Error("solver answered the wrong question");
  return answer.index;
}
