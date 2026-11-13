import { useEffect, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { gatesOpen, heldBy, partnerOf, thawIn } from "../game/engine";
import type { Blocker } from "../game/engine";
import type { Chicken, Dir, GameState, Hatch, Level } from "../game/types";
import { ArrowArt, BaleArt, ChainArt, ChickenArt, CrackArt, GateArt, HandArt, HoleArt, KeyArt, LockArt, Mark, MysteryEggArt, PAINT, PaintArt, PlateArt, SnowArt } from "./art";

export interface DropFx {
  key: number;
  chicken: Chicken;
}
export interface ShutFx {
  key: number;
  hatch: Hatch;
}
export interface HintFx {
  /** A fresh number for each hint, so the walk-through starts again. */
  key: number;
  /** Where the hatch is now. */
  from: { x: number; y: number };
  /** Where the hatch should end up. */
  ghost: Hatch;
  /** The squares its top-left corner passes through on the way. */
  path: { x: number; y: number }[];
}
/** A slide was refused: the hatch nudges that way and whatever stopped it wobbles. */
export interface BumpFx {
  key: number;
  hatch: number;
  dir: Dir;
  why: Blocker;
}
/** A hand showing the first move: from one square to another (of the hatch's first square). */
export interface DemoFx {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface Props {
  level: Level;
  game: GameState;
  cell: number;
  drops: DropFx[];
  shuts: ShutFx[];
  hint: HintFx | null;
  bump: BumpFx | null;
  demo: DemoFx | null;
  /** Eggs whose chicken has been seen. */
  seen: ReadonlySet<number>;
  locked: boolean;
  /** The hatch under the finger, and how far (in squares) it is drawn from its own square. */
  held: { id: number; dx: number; dy: number; turning: boolean } | null;
  /** A finger has come down on this hatch. */
  onGrab: (hatchId: number) => void;
  /** The finger now wants the hatch's top-left corner here, measured in squares. */
  onDrag: (hatchId: number, x: number, y: number) => void;
  /** The finger has lifted. */
  onRelease: (hatchId: number) => void;
  /** An arrow key was pressed on this hatch. */
  onNudge: (hatchId: number, dir: Dir) => void;
}

const KEYS: Record<string, Dir> = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right" };

const place = (x: number, y: number, w = 1, h = 1): CSSProperties => ({
  width: `calc(var(--cell) * ${w})`,
  height: `calc(var(--cell) * ${h})`,
  transform: `translate(calc(var(--cell) * ${x}), calc(var(--cell) * ${y}))`,
});
const at = (x: number, y: number): CSSProperties => ({ left: `calc(var(--cell) * ${x})`, top: `calc(var(--cell) * ${y})` });

/**
 * A hatch is drawn one square at a time. Each square knows which of its sides touch another
 * square of the same hatch, and leaves those sides open, so the squares join into one piece
 * with one continuous pit: a bar, a block, an L, a T.
 */
function HatchFace({ hatch, stuck = null, thaw = 0, chained = false }: { hatch: Hatch; stuck?: "ice" | "lock" | null; thaw?: number; chained?: boolean }) {
  const paint = PAINT[hatch.color];
  const has = (x: number, y: number) => hatch.cells.some(([cx, cy]) => cx === x && cy === y);
  const joins = ([cx, cy]: readonly [number, number]) => [has(cx, cy - 1), has(cx + 1, cy), has(cx, cy + 1), has(cx - 1, cy)];

  // The count sits in the middle of a rectangle, or on the busiest square of a bent hatch.
  let label = { x: hatch.w / 2, y: hatch.h / 2 };
  if (hatch.cells.length !== hatch.w * hatch.h) {
    const hub = [...hatch.cells].sort((a, b) => joins(b).filter(Boolean).length - joins(a).filter(Boolean).length)[0];
    label = { x: hub[0] + 0.5, y: hub[1] + 0.5 };
  }

  return (
    <span className={stuck ? `hatch__body hatch__body--${stuck}` : "hatch__body"} style={{ "--frame": paint.frame, "--lip": paint.body } as CSSProperties}>
      {hatch.cells.map((c) => {
        const [cx, cy] = c;
        const [up, right, down, left] = joins(c);
        const sides = `${up ? " piece--up" : ""}${right ? " piece--right" : ""}${down ? " piece--down" : ""}${left ? " piece--left" : ""}`;
        return (
          <span key={`${cx},${cy}`} className={`piece${sides}`} style={at(cx, cy)}>
            <span className="piece__frame" />
            <span className="piece__pit" />
            {/* Where the hatch bends, fill the inside corner so the frame keeps its thickness. */}
            {up && left && !has(cx - 1, cy - 1) && <span className="piece__nub piece__nub--ul" />}
            {up && right && !has(cx + 1, cy - 1) && <span className="piece__nub piece__nub--ur" />}
            {down && left && !has(cx - 1, cy + 1) && <span className="piece__nub piece__nub--dl" />}
            {down && right && !has(cx + 1, cy + 1) && <span className="piece__nub piece__nub--dr" />}
          </span>
        );
      })}
      {hatch.axis && <span className={`hatch__rail hatch__rail--${hatch.axis}`} />}
      <span className="hatch__label" style={at(label.x, label.y)}>
        {/* Re-keyed on every drop so the count pops each time a chicken lands. */}
        <span className="hatch__count" key={hatch.left}>
          <svg viewBox="0 0 24 24" className="hatch__mark" aria-hidden="true">
            <Mark color={hatch.color} cx={12} cy={12} r={7} fill={paint.body} />
          </svg>
          {hatch.left}
        </span>
        {stuck === "ice" && (
          <span className="hatch__hold">
            <SnowArt />
            {thaw}
          </span>
        )}
        {stuck === "lock" && (
          <span className="hatch__hold">
            <LockArt />
          </span>
        )}
        {chained && (
          <span className="hatch__hold">
            <ChainArt />
          </span>
        )}
      </span>
    </span>
  );
}

/**
 * The hinted hatch walking its way: an outline steps from where the hatch is, along the path,
 * to where it should end up, pauses, and goes round again. It shows a slide out and back, which
 * a still outline over the hatch itself cannot.
 */
function HintRunner({ hint }: { hint: HintFx }) {
  const stops = [hint.from, ...hint.path, { x: hint.ghost.x, y: hint.ghost.y }];
  const [at, setAt] = useState(0);
  useEffect(() => {
    setAt(0);
    let i = 0;
    let id = 0;
    const tick = () => {
      i = (i + 1) % (stops.length + 2); // two beats of rest at the end
      setAt(Math.min(i, stops.length - 1));
      id = window.setTimeout(tick, i === 0 ? 450 : 300);
    };
    id = window.setTimeout(tick, 450);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hint.key]);
  const p = stops[at];
  return (
    <span className="hint-runner" style={place(p.x, p.y, hint.ghost.w, hint.ghost.h)} aria-hidden="true">
      {hint.ghost.cells.map(([cx, cy]) => (
        <span key={`${cx},${cy}`} className="hint-runner__cell" style={{ ...place(cx, cy), position: "absolute" }} />
      ))}
    </span>
  );
}

export function Board({ level, game, cell, drops, shuts, hint, bump, demo, seen, locked, held, onGrab, onDrag, onRelease, onNudge }: Props) {
  const fieldRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; pointer: number; offX: number; offY: number } | null>(null);

  const squareUnder = (e: PointerEvent) => {
    const box = fieldRef.current!.getBoundingClientRect();
    return { x: (e.clientX - box.left) / cell, y: (e.clientY - box.top) / cell };
  };

  const down = (e: PointerEvent<HTMLButtonElement>, hatch: Hatch) => {
    if (locked) return;
    // Ignore a second finger while a hatch is being dragged. A drag whose hatch has since
    // shut is over, though: its button left the page, so it never saw the finger lift.
    const current = drag.current;
    if (current && game.hatches.some((t) => t.id === current.id)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = squareUnder(e);
    drag.current = { id: hatch.id, pointer: e.pointerId, offX: p.x - hatch.x, offY: p.y - hatch.y };
    onGrab(hatch.id);
  };
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    const p = squareUnder(e);
    onDrag(d.id, p.x - d.offX, p.y - d.offY);
  };
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (d?.pointer !== e.pointerId) return;
    drag.current = null;
    onRelease(d.id);
  };
  const key = (e: KeyboardEvent<HTMLButtonElement>, hatch: Hatch) => {
    const dir = KEYS[e.key];
    if (!dir || locked) return;
    e.preventDefault();
    onNudge(hatch.id, dir);
  };

  // While a hatch is held, the chickens it (or its chained partner) could take stand out.
  const heldHatch = held ? game.hatches.find((t) => t.id === held.id) : undefined;
  const heldPartner = heldHatch && partnerOf(game, heldHatch);
  const takes = heldHatch ? new Set([heldHatch.color, heldPartner?.color]) : null;
  const wobble = bump?.why;
  const bumpedSquare = wobble?.kind === "bale" || wobble?.kind === "hole" || wobble?.kind === "arrow" || wobble?.kind === "gate" ? wobble.y * level.w + wobble.x : -1;
  const open = gatesOpen(level, game.hatches);

  return (
    <div className="board" style={{ "--cell": `${cell}px` } as CSSProperties}>
      <div className="board__field" ref={fieldRef} style={{ width: cell * level.w, height: cell * level.h }}>
        <div className="board__floor" style={{ gridTemplateColumns: `repeat(${level.w}, var(--cell))` }} aria-hidden="true">
          {level.bales.map((bale, k) => (
            <div key={k} className={`${(k % level.w) + Math.floor(k / level.w) & 1 ? "tile tile--alt" : "tile"}${k === bumpedSquare ? " tile--wobble" : ""}`}>
              {bale && <BaleArt />}
              {level.paint[k] && <PaintArt color={level.paint[k]!} />}
              {level.plates[k] && <PlateArt down={open} />}
              {level.gates[k] && <GateArt open={open} />}
              {level.arrows[k] && <ArrowArt dir={level.arrows[k]!} />}
              {level.cracks[k] && (game.broken.includes(k) ? <HoleArt /> : <CrackArt />)}
            </div>
          ))}
        </div>

        {level.key && !game.keyTaken && (
          <span className="key" style={place(level.key.x, level.key.y)}>
            <KeyArt />
          </span>
        )}

        {hint && (
          <>
            {hint.path.map((p, i) => (
              <span key={i} className="hint-dot" style={place(p.x + hint.ghost.cells[0][0], p.y + hint.ghost.cells[0][1])} />
            ))}
            {hint.ghost.cells.map(([cx, cy]) => (
              <span key={`${cx},${cy}`} className="hint-ghost" style={place(hint.ghost.x + cx, hint.ghost.y + cy)} />
            ))}
            <HintRunner hint={hint} />
          </>
        )}

        {game.hatches.map((hatch) => {
          // A chained hatch is drawn wherever its partner is being dragged to, as well as its own.
          const partner = partnerOf(game, hatch);
          const mine = held && (held.id === hatch.id || held.id === partner?.id) ? held : null;
          const stuck = heldBy(level, game, hatch);
          const thaw = thawIn(level, game, hatch);
          const about = [
            `${PAINT[hatch.color].name} hatch, room for ${hatch.left}`,
            hatch.axis ? (hatch.axis === "h" ? "slides sideways only" : "slides up and down only") : "",
            stuck === "ice" ? `frozen until ${thaw} more ${thaw === 1 ? "chicken drops" : "chickens drop"}` : "",
            stuck === "lock" ? "padlocked until the key is picked up" : "",
            partner ? `chained to the ${PAINT[partner.color].name} hatch, they slide together` : "",
          ].filter(Boolean);
          const pushed = bump && (bump.hatch === hatch.id || bump.hatch === partner?.id) ? ` hatch--bump-${bump.dir}` : "";
          const refused = wobble && ((wobble.kind === "hatch" && wobble.id === hatch.id) || ((wobble.kind === "full" || wobble.kind === "ice" || wobble.kind === "lock" || wobble.kind === "rail") && wobble.hatch === hatch.id)) ? " hatch--wobble" : "";
          return (
            <button
              key={hatch.id}
              type="button"
              data-hatch={hatch.id}
              className={`hatch${mine ? (mine.turning ? " hatch--held hatch--turning" : " hatch--held") : ""}${hint?.ghost.id === hatch.id ? " hatch--hinted" : ""}${pushed}${refused}`}
              style={place(hatch.x + (mine?.dx ?? 0), hatch.y + (mine?.dy ?? 0), hatch.w, hatch.h)}
              aria-label={`${about.join(", ")}. Arrow keys slide it.`}
              onPointerDown={(e) => down(e, hatch)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onLostPointerCapture={up}
              onKeyDown={(e) => key(e, hatch)}
            >
              <HatchFace hatch={hatch} stuck={stuck} thaw={thaw} chained={partner !== undefined} />
            </button>
          );
        })}

        {shuts.map(({ key: k, hatch }) => (
          <span key={`shut-${k}`} className="hatch hatch--shut" style={place(hatch.x, hatch.y, hatch.w, hatch.h)}>
            <HatchFace hatch={hatch} />
          </span>
        ))}

        {game.chickens.map((c) => {
          const shake = wobble?.kind === "chicken" && wobble.id === c.id ? " chicken--wobble" : "";
          if (c.hidden && !seen.has(c.id)) {
            return (
              <span key={c.id} className={`chicken chicken--egg${shake}`} style={place(c.x, c.y)}>
                <MysteryEggArt />
              </span>
            );
          }
          const focus = takes ? (c.color === "any" || takes.has(c.color) ? " chicken--wanted" : " chicken--dim") : "";
          return (
            <span key={c.id} className={`chicken${c.hidden ? " chicken--hatched" : ""}${focus}${shake}`} style={place(c.x, c.y)}>
              <ChickenArt color={c.color} className="chicken__art" />
            </span>
          );
        })}

        {demo && (
          <span
            className="demo-hand"
            style={{ "--fx": demo.from.x, "--fy": demo.from.y, "--tx": demo.to.x, "--ty": demo.to.y } as CSSProperties}
            aria-hidden="true"
          >
            <HandArt />
          </span>
        )}

        {drops.map(({ key: k, chicken }) => (
          <span key={`drop-${k}`} className="chicken chicken--drop" style={place(chicken.x, chicken.y)}>
            <ChickenArt color={chicken.color} className="chicken__art" />
          </span>
        ))}
      </div>
    </div>
  );
}
