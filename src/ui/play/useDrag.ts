import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { step } from "../../game/engine";
import type { Dir, GameState, Level } from "../../game/types";
import { unlockAudio } from "../../sfx";
import { COMMIT, easeSlack, stepsAt, TURN_MARGIN, turnsAt } from "./model";
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
      hold({ id: hatchId, track: null, offset: 0, slack: 0 });
    },
    [hold],
  );

  /**
   * Follow the finger. `x` and `y` are where the finger wants the hatch's top-left corner, in
   * squares. The hatch glides along one axis at a time, stops dead against anything in its
   * way, and steps to the next square (dropping chickens, counting the move) as it crosses over.
   * It turns a corner from wherever it is between two squares, as long as the new way is open.
   */
  const dragTo = useCallback(
    (hatchId: number, x: number, y: number) => {
      const was = heldRef.current?.id === hatchId ? heldRef.current : null;
      let track = was?.track ?? null;
      let offset = was?.offset ?? 0;
      let slack = was?.slack ?? 0;
      let dodged = false;
      for (let guard = 0; guard < 32; guard++) {
        const hatch = gameRef.current.hatches.find((t) => t.id === hatchId);
        if (!hatch) return hold(null); // it filled up and shut mid-drag
        const dx = x - hatch.x;
        const dy = y - hatch.y;
        const dirOn = (axis: "x" | "y"): Dir => (axis === "x" ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up");
        if (!dodged) {
          if (track === null) track = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
          else {
            const other = track === "x" ? "y" : "x";
            const along = track === "x" ? dx : dy;
            const off = track === "x" ? dy : dx;
            slack = easeSlack(slack, off);
            // How far the finger has gone across since the hatch took this line, not how far
            // off the line it is: a finger running down between two columns is not asking to turn.
            const across = Math.abs(off - slack);
            // Turn the corner once the finger clearly means it.
            if (across > Math.abs(along) + TURN_MARGIN) {
              if (Math.abs(along) > COMMIT && step(level, gameRef.current, hatchId, dirOn(track))) {
                // More than halfway to the next square: it goes there first, as it would if the
                // finger lifted here (chickens and all), and turns the corner from there.
                tryStep(hatchId, dirOn(track));
                offset = along - Math.sign(along);
                continue;
              }
              if (turnsAt(along, step(level, gameRef.current, hatchId, dirOn(other)) !== null)) {
                track = other;
                slack = along;
              }
            }
          }
        }
        const axis = track ?? "y";
        const d = axis === "x" ? dx : dy;
        const dir = dirOn(axis);
        const ahead = step(level, gameRef.current, hatchId, dir);
        if (!ahead) {
          offset = 0;
          // Blocked this way. If the finger is also pulling sideways, slide along the obstacle.
          const sideways = track === "x" ? dy : dx;
          if (!dodged && Math.abs(sideways) > 0.3) {
            track = track === "x" ? "y" : "x";
            // Still pulled towards the obstacle: it goes that way again as soon as there is room.
            slack = 0;
            dodged = true;
            continue;
          }
          // Pushing on into it: say what's in the way.
          if (Math.abs(d) > 0.3) refuse(hatchId, dir);
          break;
        }
        if (stepsAt(d, ahead.dropped.length > 0)) {
          tryStep(hatchId, dir);
          offset = d - Math.sign(d); // what is left over, measured from the new square
          dodged = false;
          continue;
        }
        offset = d;
        break;
      }
      hold({ id: hatchId, track, offset, slack });
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

  /** How far the finger wants the held hatch from its own square, for the board. */
  const heldAt = held && {
    id: held.id,
    dx: held.track === "x" ? held.offset : 0,
    dy: held.track === "y" ? held.offset : 0,
  };

  return { held, heldAt, hold, grab, dragTo, release, nudge };
}
