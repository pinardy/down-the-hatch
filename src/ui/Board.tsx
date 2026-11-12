import { useRef } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";
import { heldBy, thawIn } from "../game/engine";
import type { Chicken, Dir, GameState, Hatch, Level } from "../game/types";
import { BaleArt, ChickenArt, KeyArt, LockArt, Mark, MysteryEggArt, PAINT, SnowArt } from "./art";

export interface DropFx {
  key: number;
  chicken: Chicken;
}
export interface ShutFx {
  key: number;
  hatch: Hatch;
}
export interface HintFx {
  /** Where the hatch should end up. */
  ghost: Hatch;
  /** The squares its top-left corner passes through on the way. */
  path: { x: number; y: number }[];
}

interface Props {
  level: Level;
  game: GameState;
  cell: number;
  drops: DropFx[];
  shuts: ShutFx[];
  hint: HintFx | null;
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
function HatchFace({ hatch, stuck = null, thaw = 0 }: { hatch: Hatch; stuck?: "ice" | "lock" | null; thaw?: number }) {
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
      </span>
    </span>
  );
}

export function Board({ level, game, cell, drops, shuts, hint, seen, locked, held, onGrab, onDrag, onRelease, onNudge }: Props) {
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

  return (
    <div className="board" style={{ "--cell": `${cell}px` } as CSSProperties}>
      <div className="board__field" ref={fieldRef} style={{ width: cell * level.w, height: cell * level.h }}>
        <div className="board__floor" style={{ gridTemplateColumns: `repeat(${level.w}, var(--cell))` }} aria-hidden="true">
          {level.bales.map((bale, k) => (
            <div key={k} className={(k % level.w) + Math.floor(k / level.w) & 1 ? "tile tile--alt" : "tile"}>
              {bale && <BaleArt />}
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
          </>
        )}

        {game.hatches.map((hatch) => {
          const mine = held?.id === hatch.id ? held : null;
          const stuck = heldBy(level, game, hatch);
          const thaw = thawIn(level, game, hatch);
          const about = [
            `${PAINT[hatch.color].name} hatch, room for ${hatch.left}`,
            hatch.axis ? (hatch.axis === "h" ? "slides sideways only" : "slides up and down only") : "",
            stuck === "ice" ? `frozen until ${thaw} more ${thaw === 1 ? "chicken drops" : "chickens drop"}` : "",
            stuck === "lock" ? "padlocked until the key is picked up" : "",
          ].filter(Boolean);
          return (
            <button
              key={hatch.id}
              type="button"
              data-hatch={hatch.id}
              className={`hatch${mine ? (mine.turning ? " hatch--held hatch--turning" : " hatch--held") : ""}${hint?.ghost.id === hatch.id ? " hatch--hinted" : ""}`}
              style={place(hatch.x + (mine?.dx ?? 0), hatch.y + (mine?.dy ?? 0), hatch.w, hatch.h)}
              aria-label={`${about.join(", ")}. Arrow keys slide it.`}
              onPointerDown={(e) => down(e, hatch)}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onLostPointerCapture={up}
              onKeyDown={(e) => key(e, hatch)}
            >
              <HatchFace hatch={hatch} stuck={stuck} thaw={thaw} />
            </button>
          );
        })}

        {shuts.map(({ key: k, hatch }) => (
          <span key={`shut-${k}`} className="hatch hatch--shut" style={place(hatch.x, hatch.y, hatch.w, hatch.h)}>
            <HatchFace hatch={hatch} />
          </span>
        ))}

        {game.chickens.map((c) =>
          c.hidden && !seen.has(c.id) ? (
            <span key={c.id} className="chicken chicken--egg" style={place(c.x, c.y)}>
              <MysteryEggArt />
            </span>
          ) : (
            <span key={c.id} className={c.hidden ? "chicken chicken--hatched" : "chicken"} style={place(c.x, c.y)}>
              <ChickenArt color={c.color} className="chicken__art" />
            </span>
          ),
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
