import { useCallback, useEffect, useRef, useState } from "react";
import { blockedBy, eggsFor, heldBy, isWon, startState, step, twoEggLimit } from "../game/engine";
import type { Dir, GameState, Level } from "../game/types";
import { buzz, sfx, unlockAudio } from "../sfx";
import { Board } from "./Board";
import type { BumpFx, DropFx, HintFx, ShutFx } from "./Board";
import { EggArt, GearArt, HardArt } from "./art";
import { lastWinnableInBackground, solveInBackground } from "./solving";
import { Guide } from "./Guide";
import { EndSheet } from "./play/EndSheet";
import { allowance, dirIndex, DROP_MS, EGG_LAND_MS, HINT_SEARCH, peek, REPLAY_STEP_MS, REPLAY_TURN_MS, restore, REWIND_DEADLINE_MS, SHUT_MS, STUCK_NOTE, STUCK_SEARCH, THINK_AFTER_MS, whyBlocked } from "./play/model";
import type { Phase } from "./play/model";
import { useBoardSize } from "./play/useBoardSize";
import { useDemo } from "./play/useDemo";
import { useDrag } from "./play/useDrag";
import { useNewPieces } from "./play/useNewPieces";
import { newlyUnlocked } from "./rewards";
import type { Reward, Tally } from "./rewards";
import { loadInPlay, saveInPlay } from "./storage";
import type { Cleared, Settings } from "./storage";

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
  // Which eggs have shown their chicken. Kept through undo and restart: you can't unsee it.
  const [seen, setSeen] = useState<ReadonlySet<number>>(() => new Set(resumed?.saved.seen ?? []));
  const seenRef = useRef(seen);
  const [drops, setDrops] = useState<DropFx[]>([]);
  const [shuts, setShuts] = useState<ShutFx[]>([]);
  const [hint, setHint] = useState<HintFx | null>(null);
  const [bump, setBump] = useState<BumpFx | null>(null);
  /** The refusal already shown for this grab, so pushing on against it doesn't repeat it. */
  const bumped = useRef<string | null>(null);
  // Pieces on this board the player hasn't met before get a line saying what they do.
  const firstMeeting = useNewPieces(level);
  const [notice, setNotice] = useState<{ text: string; warn: boolean } | null>(() =>
    resumed ? { text: "Picked up where you left off. Start over for a fresh go.", warn: false } : firstMeeting ? { text: firstMeeting, warn: false } : null,
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

  const { stageRef, cell } = useBoardSize(level);

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

  const { held, heldAt, hold, grab, dragTo, release, nudge } = useDrag({ level, gameRef, tryStep, refuse, fresh, bumped });

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

  // Levels that introduce something show a hand making the first move, while the player hasn't touched the board.
  const demo = useDemo(level, best);

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
        <EndSheet
          phase={phase}
          level={level}
          game={game}
          eggs={eggs}
          limit={limit}
          best={best}
          wonSolo={wonSolo}
          wonClock={wonClock}
          wonHard={wonHard}
          milestone={milestone}
          tally={tally}
          unlocked={unlocked}
          settings={settings}
          daily={daily}
          late={late}
          shareLink={shareLink}
          nextLabel={nextLabel}
          nextChapter={nextChapter}
          backLabel={backLabel}
          onNext={onNext}
          onRestart={restart}
          onWatch={watch}
          onLevels={onLevels}
          onWear={onWear}
        />
      )}
    </main>
  );
}
