// All of the game's artwork, drawn as inline SVG so the build stays one self-contained file.
// The chickens follow the round, flat style of the Exploding Chickens logo:
// an egg-shaped body, a three-bump comb, a wedge beak and a dot eye, with no outlines.

import type { Color } from "../game/types";

export const PAINT: Record<Color, { body: string; shade: string; frame: string; name: string }> = {
  red: { body: "#f58a70", shade: "#d9614a", frame: "#d4543d", name: "red" },
  gold: { body: "#f8d568", shade: "#dfae36", frame: "#e2a92a", name: "gold" },
  teal: { body: "#63d0bb", shade: "#37a892", frame: "#2f9c87", name: "teal" },
  blue: { body: "#7fb4f5", shade: "#4f8bd9", frame: "#437fd2", name: "blue" },
  plum: { body: "#c19cee", shade: "#966dcd", frame: "#8a5fc4", name: "plum" },
};

const BARN = "#b5392c";
const BEAK = "#f39a2c";
const INK = "#2b1a12";

/**
 * Each colour also has its own mark, worn as the chicken's wing and stamped on the hatch,
 * so the pairs can be told apart without relying on colour.
 */
export function Mark({ color, cx, cy, r, fill }: { color: Color; cx: number; cy: number; r: number; fill: string }) {
  switch (color) {
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

export function ChickenArt({ color, className }: { color: Color; className?: string }) {
  const p = PAINT[color];
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

/** The mark for a level cleared without a hint. */
export function SoloArt() {
  return (
    <svg className="solo" viewBox="0 0 24 24" role="img" aria-label="Cleared without hints">
      <path d="M12 2.2 l2.9 6.3 l6.9 0.8 l-5.1 4.7 l1.4 6.8 l-6.1 -3.4 l-6.1 3.4 l1.4 -6.8 l-5.1 -4.7 l6.9 -0.8 z" />
    </svg>
  );
}
