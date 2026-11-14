import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { step } from "../../game/engine";
import type { Dir, GameState, Level } from "../../game/types";
import { unlockAudio } from "../../sfx";
import { COMMIT, COMMIT_DROP, TURN } from "./model";
import type { Held } from "./model";

interface Args {
  level: Level;
  /** The board as it stands right now. */
  gameRef: MutableRefObject<GameState>;
  /** Try one step; plays its effects and says whether the hatch moved. */
  tryStep: (hatchId: number, dir: Dir) => boolean;
  /** A slide was refused: show what is in the way. */
  refuse: (hatchId: number, dir: Dir) => void;
  /** Set when a hatch is picked up, cleared by its first step: one drag is one undo. */
  fresh: MutableRefObject<boolean>;
  /** The refusal already shown for this grab; cleared when a hatch is picked up. */
  bumped: MutableRefObject<string | null>;
}

/**
 * Moving hatches by finger or by arrow key. The hatch under the finger glides between squares;
 * each square it crosses is a step through the rules.
 */
export function useDrag({ level, gameRef, tryStep, refuse, fresh, bumped }: Args) {
  const [held, setHeld] = useState<Held | null>(null);
  const heldRef = useRef<Held | null>(null);
  const hold = useCallback((next: Held | null) => {
    heldRef.current = next;
    setHeld(next);
  }, []);

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

  /** How far the held hatch is drawn from its own square, for the board. */
  const heldAt = held && {
    id: held.id,
    dx: held.track === "x" ? held.offset : 0,
    dy: held.track === "y" ? held.offset : 0,
    turning: performance.now() - held.turnedAt < 160,
  };

  return { held, heldAt, hold, grab, dragTo, release, nudge };
}
