import { useEffect, useState } from "react";
import { startState } from "../../game/engine";
import type { Level } from "../../game/types";
import type { DemoFx } from "../Board";
import { solveInBackground } from "../solving";
import type { Cleared } from "../storage";

/**
 * Levels that introduce something show a hand making the first move, until the player has
 * cleared them once. This works out that move. (Whether to show it just now is up to the caller.)
 */
export function useDemo(level: Level, best: Cleared | undefined): DemoFx | null {
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
  return demo;
}
