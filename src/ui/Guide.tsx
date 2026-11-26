// What every piece on the board does, for looking up mid-level. The pieces on the level being
// played come first; the rest are a tap away.

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Level } from "../game/types";
import { ArrowArt, BurrowArt, ChainArt, ChickenArt, CrackArt, CrateArt, DoorArt, GateArt, KeyArt, LeverArt, LockArt, MirrorArt, MysteryEggArt, PaintArt, PlateArt, SlickArt, SnowArt, StartleArt, TiredArt, TurnArt } from "./art";

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
  {
    key: "slick",
    name: "Slippery floor",
    what: "A hatch on it can’t stop: it keeps sliding the same way until something stops it or it’s off the slippery floor. All in one move.",
    art: <SlickArt />,
    on: (l) => l.slick.some(Boolean),
  },
  {
    key: "crate",
    name: "Crate",
    what: "A hatch shoves it one square on, if there’s bare floor beyond it. One crate at a time: a crate behind a crate won’t budge.",
    art: <CrateArt />,
    on: (l) => l.crates.length > 0,
  },
  {
    key: "turn",
    name: "Turntable",
    what: "A hatch that slides onto it swings a quarter turn clockwise, about that square, if there’s bare floor to swing into. One-square hatches and hatches on rails don’t turn.",
    art: <TurnArt />,
    on: (l) => l.turns.some(Boolean),
  },
  {
    key: "burrow",
    name: "Burrow",
    what: "A one-square hatch that goes into one end comes out of the other, if nothing is sitting there. Bigger hatches don’t fit.",
    art: (
      <span className="guide__pair">
        <BurrowArt end={0} />
        <BurrowArt end={1} />
      </span>
    ),
    on: (l) => l.burrow !== null,
  },
  {
    key: "skittish",
    name: "Skittish chicken",
    what: "When a hatch stops right beside it, it hops one square the way that hatch was going, if there’s room. Corner it against something to catch it.",
    art: (
      <span className="guide__skittish">
        <ChickenArt color="gold" />
        <StartleArt />
      </span>
    ),
    on: (l) => l.chickens.some((c) => c.skittish),
  },
  {
    key: "mirror",
    name: "Mirrored hatches",
    what: "Two hatches with the mirror mark slide opposite ways: one goes left, the other goes right. If either is blocked, neither moves. It counts as one move.",
    art: (
      <MiniHatch cells={[[0, 0], [1, 0]]} frame="#2fa597">
        <g transform="translate(3 3) scale(1)">
          <MirrorArt />
        </g>
      </MiniHatch>
    ),
    on: (l) => l.hatches.some((t) => t.mirror !== undefined),
  },
  {
    key: "lever",
    name: "Levers and doors",
    what: "A move that slides onto a lever flips every door on the board: shut ones open, open ones shut. A shut door can’t be entered, but a hatch already in the doorway may stay.",
    art: (
      <span className="guide__pair">
        <LeverArt flipped={false} />
        <DoorArt shut />
      </span>
    ),
    on: (l) => l.levers.some(Boolean),
  },
  {
    key: "tired",
    name: "Tired hatch",
    what: "A boot and a number: how many more times it can be picked up. Going on with it after you let go is the same move, and costs nothing.",
    art: (
      <span className="guide__tired">
        <TiredArt />
      </span>
    ),
    on: (l) => l.hatches.some((t) => t.uses !== undefined),
  },
  {
    key: "order",
    name: "Pecking order",
    what: "Chickens with numbers must go in turn: number 1 first, then 2, and so on. Until its turn, a hatch can’t take one.",
    art: (
      <span className="guide__skittish">
        <ChickenArt color="red" />
        <span className="guide__order">1</span>
      </span>
    ),
    on: (l) => l.chickens.some((c) => c.order),
  },
  {
    key: "fence",
    name: "Fence",
    what: "A fence along the edge of a square stops anything crossing it: hatches, crates and hopping chickens.",
    art: (
      <svg viewBox="0 0 30 30" aria-hidden="true">
        <rect x="13" y="2" width="4" height="26" rx="1.5" fill="#f3e2bf" stroke="#3a2014" strokeWidth="1.2" />
      </svg>
    ),
    on: (l) => l.fenceRight.some(Boolean) || l.fenceDown.some(Boolean),
  },
  {
    key: "stack",
    name: "Stacked chickens",
    what: "One chicken sitting on another. A hatch takes the top one; the one underneath waits until a hatch slides onto the square again.",
    art: (
      <span className="guide__skittish">
        <ChickenArt color="blue" />
      </span>
    ),
    on: (l) => l.chickens.some((c) => c.under),
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
