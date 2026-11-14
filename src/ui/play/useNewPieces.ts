import { useEffect, useState } from "react";
import type { Level } from "../../game/types";
import { specialPieces } from "../Guide";
import { loadMet, saveMet } from "../storage";

/**
 * Pieces on this board the player hasn't met before: the first time, a line saying what they
 * do (null when there is nothing new). A level with its own tip is already explaining its new
 * piece, so it gets no more. Either way, the pieces count as met from here on.
 */
export function useNewPieces(level: Level): string | null {
  const [newPieces] = useState(() => {
    const met = loadMet() ?? new Set<string>();
    return level.tip ? [] : specialPieces(level).filter((p) => !met.has(p.key));
  });
  // Recorded in an effect, not above: working out the state must change nothing.
  useEffect(() => {
    const met = loadMet() ?? new Set<string>();
    const pieces = specialPieces(level);
    if (pieces.some((p) => !met.has(p.key))) saveMet(new Set([...met, ...pieces.map((p) => p.key)]));
  }, [level]);
  if (newPieces.length === 1) return `New here, ${newPieces[0].name.toLowerCase()}: ${newPieces[0].what}`;
  if (newPieces.length > 1) return `New here: ${newPieces.map((p) => p.name.toLowerCase()).join(", ").replace(/, ([^,]*)$/, " and $1")}. Tap ? to see what they do.`;
  return null;
}
