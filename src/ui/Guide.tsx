// What every piece on the board does, for looking up mid-level. The pieces on the level being
// played come first; the rest are a tap away.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Level } from "../game/types";
import { ArrowArt, ChainArt, ChickenArt, CrackArt, GateArt, KeyArt, LockArt, MysteryEggArt, PaintArt, PlateArt, SnowArt } from "./art";

interface Piece {
  key: string;
  name: string;
  what: string;
  art: ReactNode;
  /** Is this piece on the level? */
  on: (level: Level) => boolean;
}

/** A hatch drawn small: a frame round a dark pit, in any shape. */
function MiniHatch({ cells, frame, children }: { cells: [number, number][]; frame: string; children?: ReactNode }) {
  return (
    <svg viewBox="0 0 30 30" aria-hidden="true">
      {cells.map(([x, y]) => (
        <rect key={`${x},${y}`} x={3 + x * 12} y={3 + y * 12} width="12" height="12" fill={frame} />
      ))}
      {/* One pit for the whole hatch: each square's pit reaches into the next square of the same hatch. */}
      {cells.map(([x, y]) => {
        const right = cells.some(([a, b]) => a === x + 1 && b === y);
        const down = cells.some(([a, b]) => a === x && b === y + 1);
        return <rect key={`p${x},${y}`} x={6 + x * 12} y={6 + y * 12} width={right ? 18 : 6} height={down ? 18 : 6} fill="#1d100a" />;
      })}
      {children}
    </svg>
  );
}

const PIECES: Piece[] = [
  {
    key: "hatch",
    name: "Hatch",
    what: "Drag it to slide it. It drops in chickens of its own colour as it passes over them. The number is how many more it can take; when it reaches 0 the hatch shuts and leaves the board.",
    art: <MiniHatch cells={[[0, 0], [1, 0], [0, 1], [1, 1]]} frame="#d4543d" />,
    on: () => true,
  },
  {
    key: "chicken",
    name: "Chicken",
    what: "Only a hatch of the same colour can take it. To any other hatch it is in the way, like a hay bale.",
    art: <ChickenArt color="red" />,
    on: () => true,
  },
  {
    key: "bent",
    name: "Bent hatch",
    what: "An L or T shape. It needs room for every square, and drops chickens with any of them.",
    art: <MiniHatch cells={[[0, 0], [0, 1], [1, 1]]} frame="#e2a92a" />,
    on: (l) => l.hatches.some((t) => t.cells.length !== t.w * t.h),
  },
  {
    key: "rail",
    name: "Hatch on rails",
    what: "Arrowheads on its frame. It slides only that way: side to side, or up and down.",
    art: (
      <MiniHatch cells={[[0, 0], [1, 0]]} frame="#437fd2">
        <path d="M4 9 l3 -3 v6 z M26 9 l-3 -3 v6 z" fill="#fff6e3" />
      </MiniHatch>
    ),
    on: (l) => l.hatches.some((t) => t.axis),
  },
  {
    key: "ice",
    name: "Frozen hatch",
    what: "A snowflake and a number. It can’t move until that many more chickens have dropped, down any hatch.",
    art: <SnowArt />,
    on: (l) => l.hatches.some((t) => t.ice),
  },
  {
    key: "lock",
    name: "Padlock and key",
    what: "A padlocked hatch can’t move until some other hatch slides over the key.",
    art: (
      <span className="guide__pair">
        <LockArt />
        <KeyArt />
      </span>
    ),
    on: (l) => l.key !== null,
  },
  {
    key: "egg",
    name: "Egg",
    what: "A chicken whose colour is hidden. Slide a hatch up beside it to crack it open and see.",
    art: <MysteryEggArt />,
    on: (l) => l.chickens.some((c) => c.hidden),
  },
  {
    key: "crack",
    name: "Cracked board",
    what: "It holds while a hatch is on it. Once the hatch slides off, it gives way and nothing can cross that square again.",
    art: <CrackArt />,
    on: (l) => l.cracks.some(Boolean),
  },
  {
    key: "white",
    name: "White chicken",
    what: "Any hatch will take it, but it uses up room in that hatch. Make sure the hatch that takes it can spare the room.",
    art: <ChickenArt color="any" />,
    on: (l) => l.chickens.some((c) => c.color === "any"),
  },
  {
    key: "chain",
    name: "Chained hatches",
    what: "Two hatches with a chain mark slide together, or not at all. When one shuts, the other goes free.",
    art: <ChainArt />,
    on: (l) => l.hatches.some((t) => t.link !== undefined),
  },
  {
    key: "paint",
    name: "Paint",
    what: "A hatch that slides onto a puddle of paint takes that colour from then on, and with it the chickens it can take. The puddle never runs dry.",
    art: <PaintArt color="blue" />,
    on: (l) => l.paint.some(Boolean),
  },
  {
    key: "plate",
    name: "Pressure plate",
    what: "While any hatch stands on a plate, every gate on the board is open.",
    art: <PlateArt down={false} />,
    on: (l) => l.plates.some(Boolean),
  },
  {
    key: "gate",
    name: "Gate",
    what: "A hatch can only slide into a gate square while the gate is open. One already inside can stay when it shuts.",
    art: <GateArt open={false} />,
    on: (l) => l.gates.some(Boolean),
  },
  {
    key: "arrow",
    name: "One-way square",
    what: "A hatch can only slide onto it moving the way the arrow points. Leaving is free.",
    art: <ArrowArt dir="right" />,
    on: (l) => l.arrows.some(Boolean),
  },
];

/** The pieces that need explaining on this level (not the plain hatch and chicken). */
export const specialPieces = (level: Level) => PIECES.filter((p) => p.key !== "hatch" && p.key !== "chicken" && p.on(level));

export function Guide({ level, onClose }: { level: Level | null; onClose: () => void }) {
  const here = level ? PIECES.filter((p) => p.on(level)) : PIECES;
  const rest = level ? PIECES.filter((p) => !p.on(level)) : [];
  const [all, setAll] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // The screen behind keeps re-rendering (a countdown, say): keep the latest onClose without re-running the effect.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const list = (pieces: Piece[]) => (
    <dl className="guide__list">
      {pieces.map((p) => (
        <div key={p.key} className="guide__item">
          <span className="guide__art">{p.art}</span>
          <div>
            <dt>{p.name}</dt>
            <dd>{p.what}</dd>
          </div>
        </div>
      ))}
    </dl>
  );

  return (
    <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="guide-title" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet__card guide">
        <h2 id="guide-title">{level ? "On this board" : "The pieces"}</h2>
        {list(here)}
        {rest.length > 0 &&
          (all ? (
            <>
              <h3 className="guide__more">Elsewhere in the game</h3>
              {list(rest)}
            </>
          ) : (
            <button type="button" className="btn btn--quiet guide__toggle" onClick={() => setAll(true)}>
              Show every piece
            </button>
          ))}
        <button type="button" ref={closeRef} className="btn btn--straw btn--big guide__close" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
