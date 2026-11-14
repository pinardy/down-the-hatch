import { useEffect, useRef, useState } from "react";
import type { Level } from "../../game/types";

/** Fit the board to whatever room the screen leaves it: a ref for that room, and the size of one square. */
export function useBoardSize(level: Level) {
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
  return { stageRef, cell };
}
