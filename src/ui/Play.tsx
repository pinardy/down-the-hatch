import { useCallback, useEffect, useRef, useState } from "react";
import { cellsOf, eggsFor, heldBy, isWon, startState, step } from "../game/engine";
import type { Dir, GameState, Hatch, Level } from "../game/types";
import { buzz, sfx, unlockAudio } from "../sfx";
import { Board } from "./Board";
import type { DropFx, HintFx, ShutFx } from "./Board";
import { EggArt } from "./art";
import { lastWinnableInBackground, solveInBackground } from "./solving";
import type { Settings } from "./storage";

interface Props {
  level: Level;
  /** Where this level sits in its chapter, from 1, and how many the chapter has. */
  place: number;
  total: number;
  best: number | undefined;
  settings: Settings;
  onCleared: (moves: number) => void;
  onNext: (() => void) | null;
  onLevels: () => void;
}

type Phase = "playing" | "won" | "timeup";

/**
 * An egg cracks open when a hatch slides up beside it. Returns `seen` itself if this hatch,
 * having just moved, is beside nothing new.
 */
function peek(game: GameState, moved: Hatch, seen: ReadonlySet<number>): ReadonlySet<number> {
  const squares = cellsOf(moved);
  const fresh = game.chickens.filter((c) => c.hidden && !seen.has(c.id) && squares.some((s) => Math.abs(s.x - c.x) + Math.abs(s.y - c.y) === 1));
  return fresh.length ? new Set([...seen, ...fresh.map((c) => c.id)]) : seen;
}

/**
 * The hatch under the finger. Its place in the rules is always a whole square, but it is drawn
 * `offset` squares further along its `track`, so it glides with the finger between squares.
 */
interface Held {
  id: number;
  track: "x" | "y" | null;
  offset: number;
  /** When it last turned a corner (ms), so it can ease round instead of darting to the finger. */
  turnedAt: number;
}

/** A hatch can change direction only when it is this close to sitting squarely on a square. */
const TURN = 0.15;
/** How far towards the next square the finger must be before the hatch counts as having moved there. */
const COMMIT = 0.5;
/** The same, when moving there drops chickens: they fall once the hatch is nearly under them. */
const COMMIT_DROP = 0.85;

/** How many positions a hint may search, and the quiet check after each move that the level can still be won. */
const HINT_SEARCH = 300_000;
const STUCK_SEARCH = 60_000;
/** A search shorter than this shows no "Thinking": the answer just appears. */
const THINK_AFTER_MS = 180;
const STUCK_NOTE = "There’s no way to clear the coop from here. Rewind goes back to the last position that could still be won.";

const DROP_MS = 460;
const SHUT_MS = 380;

/** Seconds allowed when racing the clock: generous, and longer for longer puzzles. */
const allowance = (level: Level) => 30 + level.par * 8;

export function Play({ level, place, total, best, settings, onCleared, onNext, onLevels }: Props) {
  const [game, setGame] = useState<GameState>(() => startState(level));
  const gameRef = useRef(game);
  const history = useRef<GameState[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  /** True between picking a hatch up and its first step, so one drag is one undo. */
  const fresh = useRef(false);
  const fxKey = useRef(0);
  const streak = useRef(0);
  const [held, setHeld] = useState<Held | null>(null);
  const heldRef = useRef<Held | null>(null);
  const hold = useCallback((next: Held | null) => {
    heldRef.current = next;
    setHeld(next);
  }, []);
  // Which eggs have shown their chicken. Kept through undo and restart: you can't unsee it.
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set());
  const seenRef = useRef(seen);
  const [drops, setDrops] = useState<DropFx[]>([]);
  const [shuts, setShuts] = useState<ShutFx[]>([]);
  const [hint, setHint] = useState<HintFx | null>(null);
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(null);
  /** The level can no longer be won from here: Hint gives way to Rewind. */
  const [stuck, setStuck] = useState(false);
  /** The solver has been asked something and is taking long enough to say so. */
  const [thinking, setThinking] = useState(false);
  const asking = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const clearNote = useCallback(() => {
    setNotice(null);
    setStuck(false);
  }, []);
  const markStuck = useCallback(() => {
    setStuck(true);
    setNotice({ text: STUCK_NOTE, warn: true });
  }, []);
  const [phase, setPhase] = useState<Phase>("playing");
  const [secondsLeft, setSecondsLeft] = useState(() => allowance(level));
  const started = game.moves > 0;

  // Fit the board to whatever room the screen leaves it.
  const stageRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(56);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const pad = 28; // the fence around the field
      const size = Math.floor(Math.min((el.clientWidth - pad) / level.w, (el.clientHeight - pad) / level.h, 92));
      setCell(Math.max(28, size));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [level]);

  const commit = useCallback((next: GameState) => {
    gameRef.current = next;
    setGame(next);
  }, []);

  /** Try one step. Plays its effects and returns whether the hatch moved. */
  const tryStep = useCallback(
    (hatchId: number, dir: Dir): boolean => {
      const before = gameRef.current;
      const out = step(level, before, hatchId, dir);
      if (!out) return false;
      if (fresh.current) {
        history.current.push(before);
        setCanUndo(true);
        fresh.current = false;
        streak.current = 0;
      }
      if (out.dropped.length) {
        const added = out.dropped.map((chicken) => ({ key: ++fxKey.current, chicken }));
        setDrops((d) => [...d, ...added]);
        const keys = new Set(added.map((a) => a.key));
        window.setTimeout(() => setDrops((d) => d.filter((x) => !keys.has(x.key))), DROP_MS);
        sfx.cluck(streak.current++);
        buzz(12);
      } else {
        sfx.slide();
      }
      if (out.shut) {
        const shutKey = ++fxKey.current;
        const hatch = out.shut;
        setShuts((s) => [...s, { key: shutKey, hatch }]);
        window.setTimeout(() => setShuts((s) => s.filter((x) => x.key !== shutKey)), SHUT_MS);
        window.setTimeout(() => sfx.shut(), 120);
      }
      if (out.tookKey) sfx.key();
      // Anything that was frozen or padlocked and now is not has just come free.
      if (out.state.hatches.some((t) => !heldBy(level, out.state, t) && heldBy(level, before, t))) window.setTimeout(() => sfx.free(), 140);
      commit(out.state);
      const moved = out.shut ?? out.state.hatches.find((t) => t.id === hatchId);
      const now = moved ? peek(out.state, moved, seenRef.current) : seenRef.current;
      if (now !== seenRef.current) {
        seenRef.current = now;
        setSeen(now);
        sfx.peep();
      }
      setHint(null);
      clearNote();
      if (isWon(out.state)) {
        window.setTimeout(() => {
          setPhase("won");
          sfx.win();
          onCleared(out.state.moves);
        }, DROP_MS + 120);
      }
      return true;
    },
    [level, commit, onCleared, clearNote],
  );

  const grab = useCallback(
    (hatchId: number) => {
      unlockAudio();
      fresh.current = true;
      hold({ id: hatchId, track: null, offset: 0, turnedAt: 0 });
    },
    [hold],
  );

  /**
   * Follow the finger. `x` and `y` are where the finger wants the hatch's top-left corner, in
   * squares. The hatch glides along one axis at a time, stops dead against anything in its
   * way, and steps to the next square (dropping chickens, counting the move) as it crosses over.
   */
  const dragTo = useCallback(
    (hatchId: number, x: number, y: number) => {
      const was = heldRef.current?.id === hatchId ? heldRef.current : null;
      let track = was?.track ?? null;
      let offset = was?.offset ?? 0;
      let dodged = false;
      for (let guard = 0; guard < 32; guard++) {
        const hatch = gameRef.current.hatches.find((t) => t.id === hatchId);
        if (!hatch) return hold(null); // it filled up and shut mid-drag
        const dx = x - hatch.x;
        const dy = y - hatch.y;
        if (!dodged) {
          const want = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
          if (track === null) track = want;
          else if (track !== want && Math.abs(offset) < TURN) {
            // Turn the corner, but only once the finger clearly means it.
            const along = Math.abs(track === "x" ? dx : dy);
            const across = Math.abs(want === "x" ? dx : dy);
            if (across > along + 0.12) track = want;
          }
        }
        const d = track === "x" ? dx : dy;
        const dir: Dir = track === "x" ? (d > 0 ? "right" : "left") : d > 0 ? "down" : "up";
        const ahead = step(level, gameRef.current, hatchId, dir);
        if (!ahead) {
          offset = 0;
          // Blocked this way. If the finger is also pulling sideways, slide along the obstacle.
          const sideways = track === "x" ? dy : dx;
          if (!dodged && Math.abs(sideways) > 0.3) {
            track = track === "x" ? "y" : "x";
            dodged = true;
            continue;
          }
          break;
        }
        if (Math.abs(d) >= (ahead.dropped.length ? COMMIT_DROP : COMMIT)) {
          tryStep(hatchId, dir);
          offset = d - Math.sign(d); // what is left over, measured from the new square
          dodged = false;
          continue;
        }
        offset = d;
        break;
      }
      const turned = was !== null && was.track !== null && was.track !== track;
      hold({ id: hatchId, track, offset, turnedAt: turned ? performance.now() : (was?.turnedAt ?? 0) });
    },
    [level, tryStep, hold],
  );

  /** The finger lifted: settle on the nearest square. */
  const release = useCallback(
    (hatchId: number) => {
      const h = heldRef.current;
      if (h?.id === hatchId && h.track && Math.abs(h.offset) >= COMMIT) {
        tryStep(hatchId, h.track === "x" ? (h.offset > 0 ? "right" : "left") : h.offset > 0 ? "down" : "up");
      }
      hold(null);
    },
    [tryStep, hold],
  );

  const nudge = useCallback(
    (hatchId: number, dir: Dir) => {
      fresh.current = true;
      if (!tryStep(hatchId, dir)) sfx.bump();
    },
    [tryStep],
  );

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    commit(prev);
    hold(null);
    setCanUndo(history.current.length > 0);
    setHint(null);
    clearNote();
  };

  const restart = () => {
    history.current = [];
    setCanUndo(false);
    commit(startState(level));
    hold(null);
    setHint(null);
    clearNote();
    setDrops([]);
    setShuts([]);
    setSecondsLeft(allowance(level));
    setPhase("playing");
  };

  /**
   * Wait for the solver, showing "Thinking" if it is slow. Returns null if the player moved,
   * left the level or asked again in the meantime: the answer is then for a board that is gone.
   */
  const consult = async <T,>(job: (now: GameState) => Promise<T>): Promise<{ now: GameState; answer: T } | null> => {
    if (asking.current) return null;
    asking.current = true;
    const now = gameRef.current;
    const slow = window.setTimeout(() => setThinking(true), THINK_AFTER_MS);
    try {
      const answer = await job(now);
      return alive.current && gameRef.current === now ? { now, answer } : null;
    } finally {
      window.clearTimeout(slow);
      asking.current = false;
      if (alive.current) setThinking(false);
    }
  };

  const showHint = async () => {
    unlockAudio();
    const got = await consult((now) => solveInBackground(level, now, HINT_SEARCH));
    if (!got) return;
    const { now, answer } = got;
    if (answer.status === "stuck") return markStuck();
    if (answer.status === "unknown" || !answer.steps.length) return setNotice({ text: "Too many chickens to see a way through yet. Drop a few and ask again.", warn: true });
    const first = answer.steps[0].hatch;
    const hatch = now.hatches.find((t) => t.id === first)!;
    const path: { x: number; y: number }[] = [];
    let { x, y } = hatch;
    for (const s of answer.steps) {
      if (s.hatch !== first) break;
      x += s.dir === "left" ? -1 : s.dir === "right" ? 1 : 0;
      y += s.dir === "up" ? -1 : s.dir === "down" ? 1 : 0;
      path.push({ x, y });
    }
    setHint({ ghost: { ...hatch, x, y }, path: path.slice(0, -1) });
  };

  /** Undo as far as it takes to reach a position that can still be won, and no further. */
  const rewind = async () => {
    const got = await consult((now) => lastWinnableInBackground(level, [...history.current, now], HINT_SEARCH));
    if (!got) return;
    const states = [...history.current, got.now];
    const target = states[got.answer];
    history.current = states.slice(0, got.answer);
    commit(target);
    hold(null);
    setCanUndo(history.current.length > 0);
    setHint(null);
    setStuck(false);
    const back = got.now.moves - target.moves;
    setNotice({
      text: target.moves === 0 ? "Back to the start. Try a different first move this time." : `Back ${back} ${back === 1 ? "move" : "moves"}. The coop can still be cleared from here.`,
      warn: false,
    });
  };

  // A little after each move, check quietly whether the level can still be cleared.
  useEffect(() => {
    if (phase !== "playing" || game.moves === 0 || isWon(game)) return;
    let stale = false;
    const id = window.setTimeout(() => {
      void solveInBackground(level, game, STUCK_SEARCH).then((answer) => {
        if (!stale && alive.current && gameRef.current === game && answer.status === "stuck") markStuck();
      });
    }, 450);
    return () => {
      stale = true;
      window.clearTimeout(id);
    };
  }, [game, level, phase, markStuck]);

  // The optional countdown starts on the first move.
  useEffect(() => {
    if (!settings.clock || !started || phase !== "playing") return;
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [settings.clock, started, phase]);
  useEffect(() => {
    if (settings.clock && secondsLeft === 0 && phase === "playing") {
      setPhase("timeup");
      sfx.lose();
    }
  }, [secondsLeft, settings.clock, phase]);

  const heldAt = held && {
    id: held.id,
    dx: held.track === "x" ? held.offset : 0,
    dy: held.track === "y" ? held.offset : 0,
    turning: performance.now() - held.turnedAt < 160,
  };
  const eggs = eggsFor(game.moves, level.par);
  // What the line under the board says when nothing more pressing needs saying.
  const standing =
    game.moves > level.par + 2
      ? "One egg from here. Start over to try for all three."
      : game.moves > level.par
        ? `Over par. Finish in ${level.par + 2} moves or fewer to keep two eggs.`
        : (level.tip ?? (best !== undefined ? `Your best: ${best} ${best === 1 ? "move" : "moves"}.` : "A move is one hatch, slid as far as you like."));
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <main className="screen play">
      <header className="play__top">
        <button type="button" className="btn btn--quiet" onClick={onLevels}>
          Levels
        </button>
        <h1 className="play__title">
          <span className="play__number">
            {level.chapter}, {place} of {total}
          </span>
          {level.name}
          {/* The eggs this run would earn if it finished now. They go as the moves pass par. */}
          <span className="play__eggs" role="img" aria-label={`On course for ${eggs} of 3 eggs`}>
            {[1, 2, 3].map((n) => (
              <EggArt key={n} earned={n <= eggs} />
            ))}
          </span>
        </h1>
        <dl className="stats">
          {settings.clock && (
            <div className={secondsLeft <= 10 && started ? "stat stat--hot" : "stat"}>
              <dt>Time</dt>
              <dd>{clock}</dd>
            </div>
          )}
          <div className="stat">
            <dt>Moves</dt>
            <dd>{game.moves}</dd>
          </div>
          <div className="stat">
            <dt>Par</dt>
            <dd>{level.par}</dd>
          </div>
        </dl>
      </header>

      <div className="play__stage" ref={stageRef}>
        <Board level={level} game={game} cell={cell} drops={drops} shuts={shuts} hint={hint} seen={seen} locked={phase !== "playing"} held={heldAt} onGrab={grab} onDrag={dragTo} onRelease={release} onNudge={nudge} />
      </div>

      <p className={notice?.warn ? "play__note play__note--warn" : "play__note"} role="status">
        {notice?.text ?? standing}
      </p>

      <footer className="play__bar">
        <button type="button" className="btn" onClick={undo} disabled={!canUndo || phase !== "playing"}>
          Undo
        </button>
        <button type="button" className="btn" onClick={restart} disabled={game.moves === 0 && phase === "playing"}>
          Start over
        </button>
        <button type="button" className="btn btn--straw" onClick={stuck ? rewind : showHint} disabled={phase !== "playing" || thinking} aria-busy={thinking}>
          {thinking ? "Thinking…" : stuck ? "Rewind" : "Hint"}
        </button>
      </footer>

      {phase !== "playing" && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <div className="sheet__card">
            {phase === "won" ? (
              <>
                <div className="sheet__eggs" role="img" aria-label={`${eggs} of 3 eggs`}>
                  {[1, 2, 3].map((n) => (
                    <EggArt key={n} earned={n <= eggs} />
                  ))}
                </div>
                <h2 id="sheet-title">Coop cleared</h2>
                <p>
                  {game.moves} {game.moves === 1 ? "move" : "moves"}. {game.moves <= level.par ? "That’s par, the fewest possible." : `Par is ${level.par}.`}
                </p>
                <div className="sheet__actions">
                  {onNext && (
                    <button type="button" className="btn btn--straw btn--big" onClick={onNext} autoFocus>
                      Next level
                    </button>
                  )}
                  <button type="button" className="btn" onClick={restart}>
                    Play again
                  </button>
                  <button type="button" className="btn btn--quiet" onClick={onLevels}>
                    Levels
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="sheet-title">Time’s up</h2>
                <p>
                  {game.chickens.length} {game.chickens.length === 1 ? "chicken is" : "chickens are"} still up top. The clock restarts with the level.
                </p>
                <div className="sheet__actions">
                  <button type="button" className="btn btn--straw btn--big" onClick={restart} autoFocus>
                    Try again
                  </button>
                  <button type="button" className="btn btn--quiet" onClick={onLevels}>
                    Levels
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
