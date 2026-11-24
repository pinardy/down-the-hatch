import { useEffect, useLayoutEffect, useRef } from "react";
import type { RefObject } from "react";

/**
 * Where something at `x`, moving at `v`, is after `dt` seconds of being pulled towards `to` by
 * a spring that never overshoots from rest (critically damped; `omega` is its stiffness). Worked
 * out exactly, so it is steady however long the frame took.
 */
export function spring(x: number, v: number, to: number, dt: number, omega: number): { x: number; v: number } {
  const off = x - to;
  const pull = (v + omega * off) * dt;
  const fade = Math.exp(-omega * dt);
  return { x: to + (off + pull) * fade, v: (v - omega * pull) * fade };
}

/**
 * Close behind the finger the spring is stiff, to stay about a fiftieth of a second behind it.
 * With ground to make up (it has just turned a corner) it is softer, to slide over, not dart.
 */
const STIFF = 90;
const SOFT = 55;
/** The gaps, in squares, between which it goes from stiff to soft. */
const NEAR = 0.2;
const FAR = 0.7;
export const stiffness = (gap: number) => STIFF + (SOFT - STIFF) * Math.min(1, Math.max(0, (gap - NEAR) / (FAR - NEAR)));
/** Near enough to count as arrived: squares, and squares a second. */
const REST = 0.002;
const REST_SPEED = 0.05;

/** Something on the board with a square of its own: a hatch. */
interface Placed {
  id: number;
  x: number;
  y: number;
}

interface Glide {
  /** The hatch under the finger, then any that move with it. */
  ids: number[];
  /** How far the hatch is drawn from its own square, and how fast that is changing, in squares. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Where the finger wants it, in the same terms. */
  tx: number;
  ty: number;
  /** The squares the offsets are measured from, to stay put on screen when the hatch steps on. */
  ox: number;
  oy: number;
  frame: number;
  last: number;
}

const still = () => (typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches) || document.documentElement.classList.contains("calm");

/**
 * Draws the held hatch a touch behind the finger, on a spring. In a straight line that is all
 * but invisible; where the finger turns a corner, or the hatch has ground to make up, it curves
 * over instead of jumping. A hatch may only be on one line of squares at a time, so at a corner
 * where it should be jumps from one line to the other: the spring is what makes that smooth.
 *
 * React draws each hatch on its own square, plus where the finger wants it; while a hatch is
 * held this writes over that, after every render and on every frame, and puts it back on release.
 * `held` is the hatch under the finger (`dx`, `dy` from its square) and `partner` the hatch
 * chained to it, if any; `hatches` is every hatch on the board, each found in `field` by its
 * `data-hatch`; `place` turns a position in squares into a transform.
 */
export function useGlide(field: RefObject<HTMLElement>, held: { id: number; dx: number; dy: number } | null, partner: number | undefined, hatches: readonly Placed[], place: (x: number, y: number) => string) {
  const glide = useRef<Glide | null>(null);
  const hatchesRef = useRef(hatches);
  hatchesRef.current = hatches;

  /** Draw the gliding hatches `dx`, `dy` from their own squares. */
  const draw = (ids: number[], dx: number, dy: number) => {
    for (const id of ids) {
      const hatch = hatchesRef.current.find((t) => t.id === id);
      const el = hatch && field.current?.querySelector<HTMLElement>(`[data-hatch="${id}"]`);
      if (el) el.style.transform = place(hatch.x + dx, hatch.y + dy);
    }
  };

  // After every render: React has just drawn the held hatch where the finger wants it.
  useLayoutEffect(() => {
    let g = glide.current;
    const own = held && hatches.find((t) => t.id === held.id);
    if (g && (!own || g.ids[0] !== own.id)) {
      // Let go (or the hatch filled and shut): back on its own square, as React has it. From
      // wherever it was drawn, the stylesheet eases it home.
      draw(g.ids, 0, 0);
      cancelAnimationFrame(g.frame);
      g = glide.current = null;
    }
    if (!held || !own) return;
    if (!g) g = glide.current = { ids: [], x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, ox: own.x, oy: own.y, frame: 0, last: 0 };
    g.ids = partner === undefined ? [own.id] : [own.id, partner];
    // The hatch stepped on a square: measured from the new one, it is that much further back.
    g.x += g.ox - own.x;
    g.y += g.oy - own.y;
    g.ox = own.x;
    g.oy = own.y;
    g.tx = held.dx;
    g.ty = held.dy;
    if (still()) {
      g.x = g.tx;
      g.y = g.ty;
      g.vx = g.vy = 0;
    }
    draw(g.ids, g.x, g.y);
    if (!g.frame && (g.x !== g.tx || g.y !== g.ty)) {
      g.last = performance.now();
      const tick = (now: number) => {
        const at = glide.current;
        if (!at) return;
        const dt = Math.min(0.034, Math.max(0.001, (now - at.last) / 1000));
        at.last = now;
        const omega = stiffness(Math.hypot(at.x - at.tx, at.y - at.ty));
        const sx = spring(at.x, at.vx, at.tx, dt, omega);
        const sy = spring(at.y, at.vy, at.ty, dt, omega);
        at.x = sx.x;
        at.vx = sx.v;
        at.y = sy.x;
        at.vy = sy.v;
        const arrived = Math.abs(at.x - at.tx) < REST && Math.abs(at.y - at.ty) < REST && Math.abs(at.vx) < REST_SPEED && Math.abs(at.vy) < REST_SPEED;
        if (arrived) {
          at.x = at.tx;
          at.y = at.ty;
          at.vx = at.vy = 0;
        }
        draw(at.ids, at.x, at.y);
        at.frame = arrived ? 0 : requestAnimationFrame(tick);
      };
      g.frame = requestAnimationFrame(tick);
    }
  });

  useEffect(
    () => () => {
      if (glide.current) cancelAnimationFrame(glide.current.frame);
      glide.current = null;
    },
    [],
  );
}
