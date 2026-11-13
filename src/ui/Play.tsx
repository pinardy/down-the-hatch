import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { msUntilTomorrow, untilText } from "../game/daily";
import { blockedBy, cellsOf, eggsFor, heldBy, isWon, startState, step, twoEggLimit } from "../game/engine";
import type { Blocker } from "../game/engine";
import { DIRS } from "../game/types";
import type { Dir, GameState, Hatch, Level } from "../game/types";
import { buzz, sfx, unlockAudio } from "../sfx";
import { Board } from "./Board";
import type { BumpFx, DemoFx, DropFx, HintFx, ShutFx } from "./Board";
import { ClockArt, EggArt, GearArt, HardArt, PAINT, SoloArt } from "./art";
import { lastWinnableInBackground, solveInBackground } from "./solving";
import { Guide, specialPieces } from "./Guide";
import { newlyUnlocked, rewardName } from "./rewards";
import type { Reward, Tally } from "./rewards";
import { loadInPlay, loadMet, saveInPlay, saveMet } from "./storage";
import type { Cleared, InPlay, Settings } from "./storage";

interface Props {
  level: Level;
  /** The line above the level's name: its chapter and place in it, or "Daily coop". */
  where: string;
  best: Cleared | undefined;
  /** Where an unfinished attempt is kept, so leaving doesn't lose it. None for home-made coops. */
  saveId?: string;
  /** A daily coop: its result can be shared. */
  daily?: boolean;
  /** A past day's daily coop, caught up on late. */
  late?: boolean;
  /** A link to this coop, for sharing a result on a home-made coop someone sent. */
  shareLink?: string;
  /** Clearing this level now finishes its chapter for the first time: the chapter's name and size. */
  finishesChapter?: { name: string; levels: number } | null;
  /** Clearing this level now clears every numbered level for the first time: how many there are. */
  finishesGame?: { levels: number } | null;
  /** The chapter the next level starts, when it is a different one. */
  nextChapter?: string | null;
  settings: Settings;
  /** Everything earned so far, for announcing rewards this win unlocks. */
  tally: Tally;
  /** What the way out is called: back to the level list, or to the editor. */
  backLabel?: string;
  /**
   * `solo` when the level was cleared without a hint and without having watched the solution;
   * `clock` when it was cleared inside the time with Race the clock on.
   */
  onCleared: (moves: number, solo: boolean, clock: boolean, hard: boolean) => void;
  onNext: (() => void) | null;
  /** What the way on is called, when it isn't "Next level". */
  nextLabel?: string;
  onLevels: () => void;
  /** Open the settings and rewards sheet. */
  onSettings: () => void;
  /** Put on a reward this win unlocked. */
  onWear: (r: Reward) => void;
}

/** `replay` is the best solution playing itself out; `shown` is the sheet that follows it. */
type Phase = "playing" | "won" | "timeup" | "replay" | "shown";

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
const STUCK_SEARCH = 250_000;
/** Rewind settles for the latest position proved winnable once this long has passed. */
const REWIND_DEADLINE_MS = 2_000;
/** A search shorter than this shows no "Thinking": the answer just appears. */
const THINK_AFTER_MS = 180;
const STUCK_NOTE = "There’s no way to clear the coop from here. Rewind goes back to the last position that could still be won.";

/** The best solution, played back: the pause after each square, and the longer one before a different hatch moves. */
const REPLAY_STEP_MS = 170;
const REPLAY_TURN_MS = 430;

const DROP_MS = 460;
const SHUT_MS = 380;

/** Seconds allowed when racing the clock: generous, and longer for longer puzzles. */
const allowance = (level: Level) => 30 + level.par * 8;

/** The gap between one egg landing on the win sheet and the next. */
const EGG_LAND_MS = 260;

const dirIndex = (d: Dir) => DIRS.indexOf(d);

/** A board left part-way through, replayed through the rules. Null if there is none, or it no longer fits the level. */
function restore(level: Level, saved: InPlay | null): { game: GameState; history: GameState[]; saved: InPlay } | null {
  if (!saved || !saved.log.length) return null;
  const states = [startState(level)];
  for (const [id, d] of saved.log) {
    const out = step(level, states[states.length - 1], id, DIRS[d]);
    if (!out) return null;
    states.push(out.state);
  }
  const game = states[states.length - 1];
  if (isWon(game)) return null;
  if (saved.marks.some((m, i) => m > saved.log.length || (i > 0 && m < saved.marks[i - 1]))) return null;
  return { game, history: saved.marks.map((m) => states[m]), saved };
}

/** What to tell the player when a slide is refused, for the refusals that teach a rule. */
function whyBlocked(level: Level, game: GameState, why: Blocker): string | null {
  const hatch = (id: number) => game.hatches.find((t) => t.id === id);
  switch (why.kind) {
    case "chicken": {
      const t = hatch(why.hatch);
      const bird = game.chickens.find((c) => c.id === why.id);
      if (!t || !bird) return null;
      const mine = PAINT[t.color].name;
      return `A ${mine} hatch only takes ${mine} chickens. That ${PAINT[bird.color].name} one is in the way.`;
    }
    case "full": {
      const t = hatch(why.hatch);
      return t ? `That hatch only has room for ${t.left} more. It can’t take them all at once.` : null;
    }
    case "ice": {
      const t = hatch(why.hatch);
      if (!t) return null;
      const n = Math.max(0, (t.ice ?? 0) - (level.chickens.length - game.chickens.length));
      return `Frozen until ${n} more ${n === 1 ? "chicken drops" : "chickens drop"}, anywhere on the board.`;
    }
    case "lock":
      return "Padlocked until a hatch slides over the key.";
    case "rail": {
      const t = hatch(why.hatch);
      return t ? `That hatch is on rails. It only slides ${t.axis === "h" ? "sideways" : "up and down"}.` : null;
    }
    case "hole":
      return "That board has given way. Nothing can cross it now.";
    case "arrow":
      return `That square is one-way: a hatch can only slide onto it moving ${why.dir === "up" ? "up" : why.dir === "down" ? "down" : `to the ${why.dir}`}.`;
    case "gate":
      return "The gate is shut. It opens while a hatch stands on a pressure plate.";
    default:
      return null;
  }
}

export function Play({ level, where, best, saveId, daily = false, late = false, shareLink, finishesChapter = null, finishesGame = null, nextChapter = null, nextLabel, settings, tally, backLabel = "Levels", onCleared, onNext, onLevels, onSettings, onWear }: Props) {
  // Milestones as they stood when the level opened: winning changes the props that say them.
  const milestone = useRef({ chapter: finishesChapter, game: finishesGame }).current;
  // What was earned before this level was played: rewards between then and now are new.
  const tallyAtStart = useRef(tally).current;
  const unlocked = newlyUnlocked(tallyAtStart, tally);
  // A board left part-way through last time, picked up again.
  const [resumed] = useState(() => (saveId ? restore(level, loadInPlay(saveId)) : null));
  const [game, setGame] = useState<GameState>(() => resumed?.game ?? startState(level));
  const gameRef = useRef(game);
  const history = useRef<GameState[]>(resumed?.history ?? []);
  /** The slides that led to the board, and where each undo goes back to: what is saved. */
  const trail = useRef<{ log: [number, number][]; marks: number[] }>({ log: resumed ? [...resumed.saved.log] : [], marks: resumed ? [...resumed.saved.marks] : [] });
  const [canUndo, setCanUndo] = useState(history.current.length > 0);
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
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set(resumed?.saved.seen ?? []));
  const seenRef = useRef(seen);
  const [drops, setDrops] = useState<DropFx[]>([]);
  const [shuts, setShuts] = useState<ShutFx[]>([]);
  const [hint, setHint] = useState<HintFx | null>(null);
  const [bump, setBump] = useState<BumpFx | null>(null);
  /** The refusal already shown for this grab, so pushing on against it doesn't repeat it. */
  const bumped = useRef<string | null>(null);
  // Pieces on this board the player hasn't met before: the first time, say what they do. A level
  // with its own tip is already explaining its new piece, so it needs no more.
  const [newPieces] = useState(() => {
    const met = loadMet() ?? new Set<string>();
    return level.tip ? [] : specialPieces(level).filter((p) => !met.has(p.key));
  });
  // Once seen, they're met. (Recorded here, not above: working out the state must change nothing.)
  useEffect(() => {
    const met = loadMet() ?? new Set<string>();
    const pieces = specialPieces(level);
    if (pieces.some((p) => !met.has(p.key))) saveMet(new Set([...met, ...pieces.map((p) => p.key)]));
  }, [level]);
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(() =>
    resumed
      ? { text: "Picked up where you left off. Start over for a fresh go.", warn: false }
      : newPieces.length === 1
        ? { text: `New here, ${newPieces[0].name.toLowerCase()}: ${newPieces[0].what}`, warn: false }
        : newPieces.length > 1
          ? { text: `New here: ${newPieces.map((p) => p.name.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1")}. Tap ? to see what they do.`, warn: false }
          : null,
  );
  /** The level can no longer be won from here: Hint gives way to Rewind. */
  const [stuck, setStuck] = useState(false);
  /** The piece guide is open. */
  const [guide, setGuide] = useState(false);
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
  // Help taken. A hint counts against this run only; having watched the solution counts for as
  // long as the level stays open.
  const hinted = useRef(resumed?.saved.hinted ?? false);
  const watched = useRef(false);
  const [wonSolo, setWonSolo] = useState(false);
  const [wonClock, setWonClock] = useState(false);
  /** True while the best solution is playing itself: steps then leave no undo and win nothing. */
  const replaying = useRef(false);
  const replayTimer = useRef<number | null>(null);
  const stopReplay = useCallback(() => {
    if (replayTimer.current !== null) window.clearTimeout(replayTimer.current);
    replayTimer.current = null;
    replaying.current = false;
  }, []);
  useEffect(() => stopReplay, [stopReplay]);
  const clearNote = useCallback(() => {
    setNotice(null);
    setStuck(false);
  }, []);
  const markStuck = useCallback(() => {
    setStuck(true);
    setNotice({ text: settings.hard ? "There’s no way to clear the coop from here. Start over to try again." : STUCK_NOTE, warn: true });
  }, [settings.hard]);
  /** What the solver has found about positions this game passed through: winnable or lost. */
  const verdicts = useRef(new WeakMap<GameState, boolean>());
  /** Undo or rewind used on this attempt: the clear doesn't count as a hard-mode clear. */
  const helped = useRef(false);
  const [wonHard, setWonHard] = useState(false);
  const [phase, setPhase] = useState<Phase>("playing");
  const [secondsLeft, setSecondsLeft] = useState(() => resumed?.saved.seconds || allowance(level));
  const secondsRef = useRef(secondsLeft);
  secondsRef.current = secondsLeft;
  const started = game.moves > 0;

  // Keep the board as it stands, so leaving the level (or the phone closing the tab) loses nothing.
  const save = useCallback(() => {
    if (!saveId || replaying.current) return;
    const { log, marks } = trail.current;
    if (!log.length || isWon(gameRef.current)) return saveInPlay(saveId, null);
    saveInPlay(saveId, { log, marks, seen: [...seenRef.current], hinted: hinted.current, at: Date.now(), ...(settings.clock ? { seconds: secondsRef.current } : {}) });
  }, [saveId, settings.clock]);
  useEffect(() => {
    if (phase === "playing") save();
  }, [game, phase, save]);
  useEffect(() => {
    const onHide = () => document.visibilityState === "hidden" && phase === "playing" && save();
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [phase, save]);

  // Fit the board to whatever room the screen leaves it.
  const stageRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(56);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => {
      const pad = 28; // the fence around the field
      const size = Math.floor(Math.min((el.clientWidth - pad) / level.w, (el.clientHeight - pad) / level.h, 92));
      setCell(Math.max(18, size));
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
      if (fresh.current && !replaying.current) {
        history.current.push(before);
        trail.current.marks.push(trail.current.log.length);
        setCanUndo(true);
        fresh.current = false;
        streak.current = 0;
      }
      if (!replaying.current) trail.current.log.push([hatchId, dirIndex(dir)]);
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
      for (const hatch of out.shut) {
        const shutKey = ++fxKey.current;
        setShuts((s) => [...s, { key: shutKey, hatch }]);
        window.setTimeout(() => setShuts((s) => s.filter((x) => x.key !== shutKey)), SHUT_MS);
        window.setTimeout(() => sfx.shut(), 120);
      }
      if (out.broke.length) {
        sfx.crack();
        buzz(20);
      }
      if (out.tookKey) sfx.key();
      if (out.painted.length) sfx.splash();
      if (out.gate) window.setTimeout(() => sfx.gate(out.gate === "opened"), 60);
      // Anything that was frozen or padlocked and now is not has just come free.
      if (out.state.hatches.some((t) => !heldBy(level, out.state, t) && heldBy(level, before, t))) window.setTimeout(() => sfx.free(), 140);
      commit(out.state);
      const now = out.moved.reduce((seen, hatch) => peek(out.state, hatch, seen), seenRef.current);
      if (now !== seenRef.current) {
        seenRef.current = now;
        setSeen(now);
        sfx.peep();
      }
      setHint(null);
      setBump(null);
      clearNote();
      if (isWon(out.state) && !replaying.current) {
        const solo = !hinted.current && !watched.current;
        const hard = settings.hard && solo && !helped.current;
        const onTime = settings.clock && secondsRef.current > 0;
        if (saveId) saveInPlay(saveId, null);
        window.setTimeout(() => {
          setWonSolo(solo);
          setWonClock(onTime);
          setWonHard(hard);
          setPhase("won");
          const earned = eggsFor(out.state.moves, level.par);
          for (let i = 0; i < earned; i++) window.setTimeout(() => sfx.egg(i), 320 + i * EGG_LAND_MS);
          window.setTimeout(() => (earned === 3 ? sfx.win() : sfx.done()), 320 + earned * EGG_LAND_MS);
          onCleared(out.state.moves, solo, onTime, hard);
        }, DROP_MS + 120);
      }
      return true;
    },
    [level, commit, onCleared, clearNote, saveId, settings.clock, settings.hard],
  );

  /** A slide was refused: show what is in the way, once per grab and direction. */
  const refuse = useCallback(
    (hatchId: number, dir: Dir) => {
      const tag = `${hatchId}:${dir}`;
      if (bumped.current === tag) return;
      bumped.current = tag;
      const now = gameRef.current;
      const why = blockedBy(level, now, hatchId, dir);
      if (!why) return;
      sfx.bump();
      buzz(8);
      const key = ++fxKey.current;
      setBump({ key, hatch: hatchId, dir, why });
      window.setTimeout(() => setBump((b) => (b?.key === key ? null : b)), 450);
      const text = whyBlocked(level, now, why);
      if (text) setNotice((n) => (n?.warn ? n : { text, warn: false }));
    },
    [level],
  );

  const grab = useCallback(
    (hatchId: number) => {
      unlockAudio();
      fresh.current = true;
      bumped.current = null;
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
          // Pushing on into it: say what's in the way.
          if (Math.abs(d) > 0.3) refuse(hatchId, dir);
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
    [level, tryStep, hold, refuse],
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
      bumped.current = null;
      if (!tryStep(hatchId, dir)) refuse(hatchId, dir);
    },
    [tryStep, refuse],
  );

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    helped.current = true;
    trail.current.log.length = trail.current.marks.pop() ?? 0;
    commit(prev);
    hold(null);
    setCanUndo(history.current.length > 0);
    setHint(null);
    clearNote();
  };

  const restart = () => {
    stopReplay();
    hinted.current = false;
    helped.current = false;
    history.current = [];
    trail.current = { log: [], marks: [] };
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
    if (answer.status !== "unknown") verdicts.current.set(now, answer.status === "solved");
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
    hinted.current = true;
    setHint({ key: ++fxKey.current, from: { x: hatch.x, y: hatch.y }, ghost: { ...hatch, x, y }, path: path.slice(0, -1) });
    const back = x === hatch.x && y === hatch.y;
    setNotice({ text: back ? "Slide the glowing hatch out along the dots, then back where it was." : "Slide the glowing hatch along the dots to the outline.", warn: false });
    save();
  };

  /** Put the board back to the start and play the best solution through, one slide at a time. */
  const watch = async () => {
    restart();
    watched.current = true;
    replaying.current = true;
    streak.current = 0;
    setPhase("replay");
    const answer = await solveInBackground(level, startState(level), HINT_SEARCH * 2);
    if (!alive.current || !replaying.current) return; // stopped, or left, while the solver was thinking
    if (answer.status !== "solved") {
      stopReplay();
      setPhase("playing");
      return setNotice({ text: "Couldn’t work out the best solution this time. Try a hint instead.", warn: true });
    }
    const steps = answer.steps;
    let at = 0;
    const tick = () => {
      if (!alive.current || !replaying.current) return;
      if (at === steps.length) {
        replaying.current = false;
        replayTimer.current = window.setTimeout(() => alive.current && setPhase("shown"), DROP_MS + 350);
        return;
      }
      const s = steps[at++];
      tryStep(s.hatch, s.dir);
      replayTimer.current = window.setTimeout(tick, at < steps.length && steps[at].hatch !== s.hatch ? REPLAY_TURN_MS : REPLAY_STEP_MS);
    };
    replayTimer.current = window.setTimeout(tick, 600);
  };

  /** Undo as far as it takes to reach a position that can still be won, and no further. */
  const rewind = async () => {
    const got = await consult((now) => {
      const states = [...history.current, now];
      return lastWinnableInBackground(level, states, HINT_SEARCH, states.map((s) => verdicts.current.get(s) ?? null), REWIND_DEADLINE_MS);
    });
    if (!got) return;
    const states = [...history.current, got.now];
    const target = states[got.answer];
    verdicts.current.set(target, true);
    helped.current = true;
    history.current = states.slice(0, got.answer);
    if (got.answer < trail.current.marks.length) {
      trail.current.log.length = trail.current.marks[got.answer];
      trail.current.marks = trail.current.marks.slice(0, got.answer);
    }
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

  // Levels that introduce something show a hand making the first move, until the player has
  // cleared them once, and only while the player hasn't touched the board.
  const [demo, setDemo] = useState<DemoFx | null>(null);
  useEffect(() => {
    if (!level.demo || best) return;
    let live = true;
    void solveInBackground(level, startState(level), 20_000).then((answer) => {
      if (!live || answer.status !== "solved" || !answer.steps.length) return;
      const first = answer.steps[0].hatch;
      const hatch = level.hatches.find((t) => t.id === first)!;
      const [cx, cy] = hatch.cells[0];
      let x = hatch.x + cx;
      let y = hatch.y + cy;
      const path = [{ x, y }];
      for (const st of answer.steps) {
        if (st.hatch !== first) break;
        x += st.dir === "left" ? -1 : st.dir === "right" ? 1 : 0;
        y += st.dir === "up" ? -1 : st.dir === "down" ? 1 : 0;
        path.push({ x, y });
      }
      setDemo({ path });
    });
    return () => {
      live = false;
    };
    // `best` only matters as the level opens: clearing it mid-demo needn't restart anything.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level]);

  // A little after each move, check quietly whether the level can still be cleared.
  useEffect(() => {
    if (phase !== "playing" || game.moves === 0 || isWon(game)) return;
    let stale = false;
    const id = window.setTimeout(() => {
      void solveInBackground(level, game, STUCK_SEARCH, true).then((answer) => {
        // Remembered either way: Rewind can start from what is already known.
        if (answer.status !== "unknown") verdicts.current.set(game, answer.status === "solved");
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
    // Reading the piece guide doesn't cost time.
    if (!settings.clock || !started || phase !== "playing" || guide) return;
    const id = window.setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(id);
  }, [settings.clock, started, phase, guide]);
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
  const limit = twoEggLimit(level.par);
  // What the line under the board says when nothing more pressing needs saying.
  const standing =
    phase === "replay" || phase === "shown"
      ? `The best solution: ${level.par} ${level.par === 1 ? "move" : "moves"}.`
      : game.moves > limit
      ? "One egg from here. Start over to try for all three."
      : game.moves > level.par
        ? `Over par. Finish in ${limit} moves or fewer to keep two eggs.`
          : (level.tip ?? (late && game.moves === 0 ? "A day you missed. It earns eggs and counts towards rewards, but not the streak." : best ? `Your best: ${best.moves} ${best.moves === 1 ? "move" : "moves"}.` : "A move is one hatch, slid as far as you like."));

  // Sharing a daily result: no board, no spoilers, just how it went.
  const [shared, setShared] = useState<string | null>(null);
  const share = async () => {
    const result = `${game.moves} ${game.moves === 1 ? "move" : "moves"} (par ${level.par}) ${"🥚".repeat(eggs)}${"⚪".repeat(3 - eggs)}${wonSolo ? " ⭐ no hints" : ""}`;
    const text = shareLink
      ? [`I cleared “${level.name}” in Down the Hatch: ${result}`, `Your turn: ${shareLink}`].join("\n")
      : [`Down the Hatch, daily coop ${level.name}`, result, location.origin + location.pathname].join("\n");
    try {
      if (navigator.share) {
        await navigator.share({ text });
        return;
      }
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setShared("Copied. Paste it anywhere.");
    } catch {
      setShared(text);
    }
  };
  const clock = `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;

  return (
    <main className="screen play">
      <header className="play__top">
        <div className="play__nav">
          <button type="button" className="btn btn--quiet" onClick={onLevels}>
            {backLabel}
          </button>
          <button type="button" className="btn btn--quiet play__help" onClick={() => setGuide(true)} aria-label="What the pieces do">
            ?
          </button>
          <button type="button" className="btn btn--quiet play__help" onClick={onSettings} aria-label="Settings and rewards">
            <GearArt />
          </button>
        </div>
        <h1 className="play__title">
          <span className="play__number">
            {where}
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
        <Board
          level={level}
          game={game}
          cell={cell}
          drops={drops}
          shuts={shuts}
          hint={hint}
          bump={bump}
          demo={demo && game.moves === 0 && !held && phase === "playing" ? demo : null}
          seen={seen}
          locked={phase !== "playing"}
          held={heldAt}
          onGrab={grab}
          onDrag={dragTo}
          onRelease={release}
          onNudge={nudge}
        />
      </div>

      <p className={notice?.warn ? "play__note play__note--warn" : "play__note"} role="status">
        {notice?.text ?? standing}
      </p>

      {settings.hard && phase !== "replay" ? (
        // Hard mode: no undo, no hint, no rewind. Only starting over.
        <footer className="play__bar play__bar--hard">
          <span className="play__hard">
            <HardArt /> Hard mode
          </span>
          <button type="button" className="btn" onClick={restart} disabled={game.moves === 0 && phase === "playing"}>
            Start over
          </button>
        </footer>
      ) : (
        <footer className="play__bar">
          <button type="button" className="btn" onClick={undo} disabled={!canUndo || phase !== "playing"}>
            Undo
          </button>
          <button type="button" className="btn" onClick={restart} disabled={game.moves === 0 && phase === "playing"}>
            {phase === "replay" ? "Stop" : "Start over"}
          </button>
          <button type="button" className="btn btn--straw" onClick={stuck ? rewind : showHint} disabled={phase !== "playing" || thinking} aria-busy={thinking}>
            {thinking ? "Thinking…" : stuck ? "Rewind" : "Hint"}
          </button>
        </footer>
      )}

      {guide && <Guide level={level} onClose={() => setGuide(false)} />}

      {phase !== "playing" && phase !== "replay" && (
        <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
          <div className="sheet__card">
            {phase === "won" ? (
              <>
                {(eggs === 3 || milestone.chapter || milestone.game) && (
                  <div className="burst" aria-hidden="true">
                    {Array.from({ length: 14 }, (_, i) => (
                      <span key={i} style={{ "--a": `${(i * 360) / 14}deg`, "--d": `${(i % 3) * 60}ms` } as CSSProperties} />
                    ))}
                  </div>
                )}
                <div className="sheet__eggs" role="img" aria-label={`${eggs} of 3 eggs`}>
                  {[1, 2, 3].map((n) => (
                    <span key={n} className={n <= eggs ? "sheet__egg sheet__egg--earned" : "sheet__egg"} style={{ animationDelay: `${320 + (n - 1) * EGG_LAND_MS}ms` }}>
                      <EggArt earned={n <= eggs} />
                    </span>
                  ))}
                </div>
                {milestone.game ? (
                  <div className="sheet__milestone">
                    <p className="sheet__kicker">Every coop cleared!</p>
                    <p>
                      That’s all {milestone.game.levels} levels. {tally.eggs} of {milestone.game.levels * 3} eggs and {tally.stars} stars so far. The daily coop is waiting tomorrow, and the level editor whenever you want to set a puzzle of your own.
                    </p>
                  </div>
                ) : (
                  milestone.chapter && (
                    <div className="sheet__milestone">
                      <p className="sheet__kicker">Chapter complete!</p>
                      <p>
                        All {milestone.chapter.levels} levels of {milestone.chapter.name} cleared.
                      </p>
                    </div>
                  )
                )}
                <h2 id="sheet-title">Coop cleared</h2>
                <p>
                  {game.moves} {game.moves === 1 ? "move" : "moves"}. {game.moves <= level.par ? "That’s par, the fewest possible." : `Par is ${level.par}.`}
                </p>
                {(wonSolo || wonClock || wonHard) && (
                  <p className="sheet__solo">
                    {wonHard && (
                      <>
                        <HardArt /> Hard mode.
                      </>
                    )}
                    {wonSolo && (
                      <>
                        <SoloArt /> No hints used.
                      </>
                    )}
                    {wonClock && (
                      <>
                        <ClockArt /> Beat the clock.
                      </>
                    )}
                  </p>
                )}
                {game.moves > level.par && <p className="sheet__more">{eggs === 2 ? "Match par for the third egg." : `${limit} moves or fewer earns two eggs; par earns three.`}</p>}
                {daily && !late && <p className="sheet__more">Next board in {untilText(msUntilTomorrow(new Date()))}.</p>}
                {unlocked.length > 0 && (
                  <div className="sheet__reward">
                    <p>Unlocked: {unlocked.map(rewardName).join(" and ")}!</p>
                    <div className="sheet__wear">
                      {unlocked.map((r) => {
                        const on = r.kind === "board" ? settings.board === r.id : settings.hat === r.id;
                        return (
                          <button key={r.id} type="button" className="btn" onClick={() => onWear(r)} disabled={on}>
                            {on ? `Wearing the ${r.name}` : `Try on the ${r.name}`}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="sheet__actions">
                  {onNext && (
                    <button type="button" className="btn btn--straw btn--big" onClick={onNext} autoFocus>
                      {nextLabel ?? (nextChapter ? `On to ${nextChapter}` : "Next level")}
                    </button>
                  )}
                  {(daily || shareLink) && (
                    <button type="button" className="btn btn--straw btn--big" onClick={share} autoFocus>
                      Share result
                    </button>
                  )}
                  {shared && (
                    <p className="sheet__shared" role="status">
                      {shared}
                    </p>
                  )}
                  <button type="button" className="btn" onClick={restart}>
                    Play again
                  </button>
                  {game.moves > level.par && (
                    <button type="button" className="btn" onClick={watch}>
                      Watch the best solution
                    </button>
                  )}
                  <button type="button" className="btn btn--quiet" onClick={onLevels}>
                    {backLabel}
                  </button>
                </div>
              </>
            ) : phase === "shown" ? (
              <>
                <h2 id="sheet-title">That’s par</h2>
                <p>
                  {level.par} {level.par === 1 ? "move" : "moves"} is the fewest possible.{best ? ` Your best is ${best.moves}.` : ""} Now try it yourself.
                </p>
                <div className="sheet__actions">
                  <button type="button" className="btn btn--straw btn--big" onClick={restart} autoFocus>
                    Play again
                  </button>
                  {onNext && (
                    <button type="button" className="btn" onClick={onNext}>
                      Next level
                    </button>
                  )}
                  <button type="button" className="btn btn--quiet" onClick={onLevels}>
                    {backLabel}
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
                    {backLabel}
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
