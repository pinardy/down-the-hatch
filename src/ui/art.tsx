// All of the game's artwork, drawn as inline SVG so the build stays one self-contained file.
// The chickens follow the round, flat style of the Exploding Chickens logo:
// an egg-shaped body, a three-bump comb, a wedge beak and a dot eye, with no outlines.

import type { Color, Dir, Feather } from "../game/types";
import { useHat } from "./rewards";
import type { Hat } from "./rewards";

export const PAINT: Record<Feather, { body: string; shade: string; frame: string; name: string }> = {
  red: { body: "#f58a70", shade: "#d9614a", frame: "#d4543d", name: "red" },
  gold: { body: "#f8d568", shade: "#dfae36", frame: "#e2a92a", name: "gold" },
  teal: { body: "#63d0bb", shade: "#37a892", frame: "#2f9c87", name: "teal" },
  blue: { body: "#7fb4f5", shade: "#4f8bd9", frame: "#437fd2", name: "blue" },
  plum: { body: "#c19cee", shade: "#966dcd", frame: "#8a5fc4", name: "plum" },
  // The white chicken, which any hatch will take. There is no white hatch, so no frame is ever drawn in it.
  any: { body: "#fff6e3", shade: "#d9c7a0", frame: "#d9c7a0", name: "white" },
};

const BARN = "#b5392c";
const BEAK = "#f39a2c";
const INK = "#2b1a12";

/**
 * Each colour also has its own mark, worn as the chicken's wing and stamped on the hatch,
 * so the pairs can be told apart without relying on colour.
 */
export function Mark({ color, cx, cy, r, fill }: { color: Feather; cx: number; cy: number; r: number; fill: string }) {
  switch (color) {
    case "any":
      // A ring: room for any of the marks.
      return <circle cx={cx} cy={cy} r={r * 0.85} fill="none" stroke={fill} strokeWidth={r * 0.5} />;
    case "red":
      return <circle cx={cx} cy={cy} r={r} fill={fill} />;
    case "gold":
      return <path d={`M${cx} ${cy - r * 1.1} L${cx + r * 1.15} ${cy + r * 0.9} L${cx - r * 1.15} ${cy + r * 0.9} Z`} fill={fill} strokeLinejoin="round" stroke={fill} strokeWidth={r * 0.35} />;
    case "teal":
      return <rect x={cx - r * 0.9} y={cy - r * 0.9} width={r * 1.8} height={r * 1.8} rx={r * 0.35} fill={fill} />;
    case "blue":
      return <path d={`M${cx} ${cy - r * 1.2} L${cx + r * 1.2} ${cy} L${cx} ${cy + r * 1.2} L${cx - r * 1.2} ${cy} Z`} fill={fill} strokeLinejoin="round" stroke={fill} strokeWidth={r * 0.3} />;
    case "plum":
      return <path d={`M${cx - r} ${cy} H${cx + r} M${cx} ${cy - r} V${cy + r}`} stroke={fill} strokeWidth={r * 0.8} strokeLinecap="round" fill="none" />;
  }
}

/** Hats, drawn on the chicken's head (centred at 68,45, radius 22). */
export function HatArt({ hat }: { hat: Hat }) {
  switch (hat) {
    case "none":
      return null;
    case "bow":
      return (
        <g>
          <path d="M44 32 l12 7 l-12 7 z M68 32 l-12 7 l12 7 z" fill="#e8577c" />
          <circle cx="56" cy="39" r="4" fill="#c23a5f" />
        </g>
      );
    case "straw":
      return (
        <g>
          <ellipse cx="68" cy="28" rx="30" ry="6" fill="#d9a441" />
          <path d="M52 28 q0 -16 16 -16 q16 0 16 16 z" fill="#ebbd5c" />
          <path d="M52 25 h32" stroke={BARN} strokeWidth="4" />
        </g>
      );
    case "shades":
      return (
        <g>
          <rect x="66" y="38" width="18" height="11" rx="5" fill={INK} />
          <path d="M66 42 h-18" stroke={INK} strokeWidth="3" />
          <path d="M70 41 l5 0" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.6" />
        </g>
      );
    case "flower":
      return (
        <g>
          {[0, 72, 144, 216, 288].map((a) => (
            <ellipse key={a} cx="56" cy="20" rx="4.5" ry="8" fill="#fffdf5" transform={`rotate(${a} 56 28)`} />
          ))}
          <circle cx="56" cy="28" r="4.5" fill="#f0c24f" />
        </g>
      );
    case "party":
      return (
        <g>
          <path d="M56 30 l12 -26 l12 26 z" fill="#5fb7e8" />
          <path d="M60 22 l16 -2 M63 14 l9 -1" stroke="#f0c24f" strokeWidth="3" strokeLinecap="round" />
          <circle cx="68" cy="4" r="4" fill="#e8577c" />
        </g>
      );
    case "chef":
      return (
        <g>
          <rect x="54" y="20" width="28" height="10" rx="2" fill="#fffdf5" stroke="#e2cfa8" strokeWidth="1.5" />
          <circle cx="58" cy="14" r="8" fill="#fffdf5" />
          <circle cx="68" cy="10" r="9" fill="#fffdf5" />
          <circle cx="78" cy="14" r="8" fill="#fffdf5" />
          <path d="M56 22 h24" stroke="#e2cfa8" strokeWidth="1.5" />
        </g>
      );
    case "crown":
      return (
        <g>
          <path d="M52 30 l2 -18 l8 9 l6 -12 l6 12 l8 -9 l2 18 z" fill="#f0c24f" stroke="#c99a2a" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="68" cy="24" r="2.5" fill={BARN} />
        </g>
      );
  }
}

export function ChickenArt({ color, className, hat }: { color: Feather; className?: string; hat?: Hat }) {
  const p = PAINT[color];
  const worn = useHat();
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true">
      {/* tail */}
      <path d="M26 66 q-16 -8 -12 -26 q10 4 14 14 q-2 -14 8 -20 q8 12 2 30 z" fill={p.shade} />
      {/* feet */}
      <path d="M46 104 v9 m-7 0 h14 M72 104 v9 m-7 0 h14" stroke={BEAK} strokeWidth="5" strokeLinecap="round" fill="none" />
      {/* body and belly */}
      <ellipse cx="58" cy="74" rx="38" ry="33" fill={p.body} />
      <ellipse cx="60" cy="90" rx="22" ry="12" fill={p.shade} opacity="0.45" />
      {/* head */}
      <circle cx="68" cy="45" r="22" fill={p.body} />
      <path d="M53 29 q5 -13 11 -2 q5 -14 11 -2 q6 -12 10 3 q-16 -8 -32 1 z" fill={BARN} />
      <path d="M86 46 l16 5 l-16 7 z" fill={BEAK} />
      <path d="M87 58 q6 6 0 12 q-5 -6 0 -12 z" fill={BARN} />
      <circle cx="75" cy="44" r="4" fill={INK} />
      <circle cx="76.4" cy="42.6" r="1.4" fill="#fff" />
      {/* wing, in the colour's own mark */}
      <Mark color={color} cx={46} cy={76} r={9} fill={p.shade} />
      <HatArt hat={hat ?? worn} />
    </svg>
  );
}

export function BaleArt() {
  return (
    <svg className="bale-art" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="6" y="14" width="88" height="74" rx="12" fill="#d9a441" />
      <rect x="6" y="14" width="88" height="22" rx="12" fill="#ebbd5c" />
      <path d="M14 46 h20 M44 52 h26 M22 64 h30 M62 70 h22 M16 78 h16 M56 40 h28" stroke="#b9852b" strokeWidth="3.5" strokeLinecap="round" />
      <rect x="28" y="14" width="7" height="74" fill="#8a5a2b" opacity="0.75" />
      <rect x="65" y="14" width="7" height="74" fill="#8a5a2b" opacity="0.75" />
    </svg>
  );
}

/** A chicken still in its egg: no telling what colour it is. */
export function MysteryEggArt() {
  return (
    <svg className="chicken__art" viewBox="0 0 120 120" aria-hidden="true">
      <path d="M60 14 c22 0 37 30 37 55 c0 23 -16 39 -37 39 s-37 -16 -37 -39 c0 -25 15 -55 37 -55 z" fill="#fff6e3" />
      <path d="M60 14 c22 0 37 30 37 55 c0 23 -16 39 -37 39 c18 -8 24 -24 24 -42 c0 -22 -10 -44 -24 -52 z" fill="#e9d9b8" />
      <circle cx="40" cy="50" r="4" fill="#e2cfa8" />
      <circle cx="48" cy="90" r="5" fill="#e2cfa8" />
      <circle cx="33" cy="74" r="3" fill="#e2cfa8" />
      <path d="M50 52 q0 -13 11 -13 q11 0 11 11 q0 8 -9 12 q-3 2 -3 7" fill="none" stroke={INK} strokeWidth="7" strokeLinecap="round" />
      <circle cx="60" cy="84" r="4.5" fill={INK} />
    </svg>
  );
}

export function KeyArt() {
  return (
    <svg className="key__art" viewBox="0 0 100 100" aria-hidden="true">
      <g transform="rotate(-35 50 50)">
        <circle cx="30" cy="50" r="17" fill="none" stroke="#f0c24f" strokeWidth="10" />
        <path d="M46 50 h40 M70 50 v14 M84 50 v12" stroke="#f0c24f" strokeWidth="10" strokeLinecap="round" fill="none" />
        <path d="M18 43 a14 14 0 0 1 18 -8" stroke="#fff6e3" strokeWidth="4" strokeLinecap="round" fill="none" />
      </g>
    </svg>
  );
}

/** Two links of chain: this hatch slides with another. */
export function ChainArt() {
  return (
    <svg className="hold-art" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="2.5" y="8" width="11" height="8" rx="4" fill="none" stroke="#fff6e3" strokeWidth="2.6" />
      <rect x="10.5" y="8" width="11" height="8" rx="4" fill="none" stroke="#f0c24f" strokeWidth="2.6" />
    </svg>
  );
}

/** A puddle of paint: a hatch that slides onto it takes its colour. It carries the colour's mark too. */
export function PaintArt({ color }: { color: Color }) {
  const p = PAINT[color];
  return (
    <svg className="floor-art" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M50 14 c14 0 18 10 28 12 c10 2 12 14 6 22 c-6 8 4 14 -2 24 c-6 10 -18 6 -26 12 c-8 6 -22 4 -26 -6 c-4 -10 -16 -10 -14 -22 c2 -12 10 -12 10 -22 c0 -12 10 -20 24 -20 z" fill={p.frame} />
      <path d="M38 26 c6 -4 14 -4 18 0" stroke="#fff" strokeOpacity="0.45" strokeWidth="5" strokeLinecap="round" fill="none" />
      <circle cx="84" cy="16" r="5" fill={p.frame} />
      <circle cx="14" cy="84" r="4" fill={p.frame} />
      <Mark color={color} cx={50} cy={54} r={11} fill={p.body} />
    </svg>
  );
}

/** A pressure plate: while a hatch stands on it, the gates are open. */
export function PlateArt({ down }: { down: boolean }) {
  return (
    <svg className="floor-art" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="14" y="14" width="72" height="72" rx="16" fill="#3a2014" />
      <rect x="20" y={down ? 24 : 18} width="60" height="60" rx="13" fill={down ? "#9a6a3a" : "#c99a2a"} />
      <rect x="20" y={down ? 24 : 18} width="60" height="12" rx="6" fill="#fff6e3" opacity={down ? 0.15 : 0.35} />
      <circle cx="50" cy={down ? 54 : 48} r="9" fill="#3a2014" opacity="0.5" />
    </svg>
  );
}

/** A gate square: barred while no plate is held down, open while one is. */
export function GateArt({ open }: { open: boolean }) {
  return (
    <svg className={open ? "floor-art gate-art gate-art--open" : "floor-art gate-art"} viewBox="0 0 100 100" aria-hidden="true">
      <rect x="6" y="8" width="12" height="84" rx="4" fill="#5a3421" />
      <rect x="82" y="8" width="12" height="84" rx="4" fill="#5a3421" />
      <g className="gate-art__bars">
        <rect x="12" y="24" width="76" height="14" rx="5" fill="#d9a441" />
        <rect x="12" y="62" width="76" height="14" rx="5" fill="#d9a441" />
        <path d="M18 38 L82 62" stroke="#b9852b" strokeWidth="10" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const TURN: Record<Dir, number> = { right: 0, down: 90, left: 180, up: 270 };

/** A one-way square: a hatch can only slide onto it the way the arrow points. */
export function ArrowArt({ dir }: { dir: Dir }) {
  return (
    <svg className="floor-art" viewBox="0 0 100 100" aria-hidden="true">
      <g transform={`rotate(${TURN[dir]} 50 50)`}>
        <path d="M22 30 L46 50 L22 70 M50 30 L74 50 L50 70" fill="none" stroke="#fff6e3" strokeOpacity="0.75" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** A cracked board: it will hold for one crossing. */
export function CrackArt() {
  return (
    <svg className="crack-art" viewBox="0 0 100 100" aria-hidden="true">
      <rect x="7" y="7" width="86" height="86" rx="12" fill="#b98a5e" />
      <path d="M7 36 h86 M7 66 h86" stroke="#8a5f3c" strokeWidth="3" />
      <path d="M22 8 l10 20 l-9 14 l15 16 l-6 16 l12 18 M78 92 l-8 -16 l9 -12 l-13 -15 l5 -13 l-9 -14" fill="none" stroke="#3a2014" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Where a cracked board used to be. */
export function HoleArt() {
  return (
    <svg className="hole-art" viewBox="0 0 100 100" aria-hidden="true">
      <path d="M10 14 l14 -6 l12 5 l16 -6 l14 6 l14 -4 l10 9 l-3 16 l5 14 l-6 14 l5 16 l-9 12 l-16 -3 l-14 6 l-14 -5 l-16 4 l-10 -10 l4 -16 l-6 -14 l5 -16 z" fill="#1d100a" />
      <path d="M22 24 l12 -4 l12 4 l14 -5 l14 6 l8 -2 l-2 12 l4 12 l-5 12 l3 12 l-8 6 l-12 -3 l-12 5 l-12 -4 l-12 3 l-5 -8 l3 -12 l-5 -12 z" fill="#0f0704" />
    </svg>
  );
}

export function LockArt() {
  return (
    <svg className="hold-art" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7.5 11 V8 a4.5 4.5 0 0 1 9 0 v3" fill="none" stroke="#fff6e3" strokeWidth="2.6" strokeLinecap="round" />
      <rect x="4.5" y="10.5" width="15" height="11" rx="3" fill="#f0c24f" />
      <circle cx="12" cy="16" r="2" fill={INK} />
    </svg>
  );
}

export function SnowArt() {
  return (
    <svg className="hold-art" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 v18 M4.2 7.5 l15.6 9 M19.8 7.5 l-15.6 9" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}

export function EggArt({ earned }: { earned: boolean }) {
  return (
    <svg className={earned ? "egg egg--earned" : "egg"} viewBox="0 0 20 24" aria-hidden="true">
      <path d="M10 1.5 c4.6 0 8 6.6 8 12.2 c0 4.8 -3.4 8.6 -8 8.6 s-8 -3.8 -8 -8.6 c0 -5.6 3.4 -12.2 8 -12.2 z" />
    </svg>
  );
}

/** Title art: a chicken on the lip of an open hatch. */
export function TitleArt() {
  return (
    <div className="title-art" aria-hidden="true">
      <div className="title-art__hatch">
        <div className="title-art__pit" />
      </div>
      <ChickenArt color="gold" className="title-art__chicken" />
    </div>
  );
}

/** The mark for a level cleared inside the time, with Race the clock on. */
export function ClockArt() {
  return (
    <svg className="clock-badge" viewBox="0 0 24 24" role="img" aria-label="Beat the clock">
      <circle cx="12" cy="13" r="8.5" fill="#fff6e3" stroke="currentColor" strokeWidth="2.4" />
      <path d="M12 8.5 V13 l3 2" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      <path d="M9.5 2.5 h5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/** A small calendar page, for rewards paid in daily coops. */
export function DayArt() {
  return (
    <svg className="day-art" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="2.2" />
      <path d="M3 10 h18 M8 3 v4 M16 3 v4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

/** A gear, for settings. */
export function GearArt() {
  return (
    <svg className="gear-art" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M10.3 2.5 h3.4 l.5 2.6 a7.5 7.5 0 0 1 1.9 1.1 l2.5 -.9 1.7 2.9 -2 1.7 a7.5 7.5 0 0 1 0 2.2 l2 1.7 -1.7 2.9 -2.5 -.9 a7.5 7.5 0 0 1 -1.9 1.1 l-.5 2.6 h-3.4 l-.5 -2.6 a7.5 7.5 0 0 1 -1.9 -1.1 l-2.5 .9 -1.7 -2.9 2 -1.7 a7.5 7.5 0 0 1 0 -2.2 l-2 -1.7 1.7 -2.9 2.5 .9 a7.5 7.5 0 0 1 1.9 -1.1 z"
        fill="currentColor"
      />
      <circle cx="12" cy="12" r="3.2" fill="var(--bg)" />
    </svg>
  );
}

/** A pointing hand, for showing a new player what to do. */
export function HandArt() {
  return (
    <svg className="hand-art" viewBox="0 0 48 48" aria-hidden="true">
      <path
        d="M17 26 V9 a3.5 3.5 0 0 1 7 0 v12 l1 -1 a3.5 3.5 0 0 1 6 2 l1 -.5 a3.5 3.5 0 0 1 5.5 2.5 l.5 -.2 a3.5 3.5 0 0 1 5 3 v7 c0 7 -5 12 -12 12 h-3 c-5 0 -8 -2 -11 -6 l-7 -9 a3.4 3.4 0 0 1 5 -4.5 z"
        fill="#fff6e3"
        stroke="#2b1a12"
        strokeWidth="2.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** The mark for a level cleared without a hint. */
export function SoloArt() {
  return (
    <svg className="solo" viewBox="0 0 24 24" role="img" aria-label="Cleared without hints">
      <path d="M12 2.2 l2.9 6.3 l6.9 0.8 l-5.1 4.7 l1.4 6.8 l-6.1 -3.4 l-6.1 3.4 l1.4 -6.8 l-5.1 -4.7 l6.9 -0.8 z" />
    </svg>
  );
}
