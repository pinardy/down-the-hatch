// Tiny synthesized sound effects, generated with the Web Audio API so there is nothing to download.

let ctx: AudioContext | null = null;
let enabled = true;

export function setSoundEnabled(on: boolean) {
  enabled = on;
}

/** Call from a tap so the browser lets audio start. */
export function unlockAudio() {
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    ctx ??= new Ctor();
    if (ctx.state === "suspended") void ctx.resume();
  } catch {
    ctx = null;
  }
}

function tone(wave: OscillatorType, from: number, to: number, dur: number, gain: number, at = 0) {
  if (!ctx || !enabled) return;
  const t0 = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(from, t0);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

let lastSlide = 0;

export const sfx = {
  slide() {
    const now = performance.now();
    if (now - lastSlide < 70) return;
    lastSlide = now;
    tone("triangle", 190, 150, 0.06, 0.07);
  },
  /** A two-note "bawk", pitched up a little for each chicken in a row. */
  cluck(streak = 0) {
    const lift = 1 + Math.min(streak, 6) * 0.07;
    tone("square", 520 * lift, 760 * lift, 0.07, 0.09);
    tone("square", 700 * lift, 380 * lift, 0.12, 0.09, 0.07);
  },
  shut() {
    tone("sine", 220, 70, 0.2, 0.3);
    tone("triangle", 90, 60, 0.12, 0.2, 0.02);
  },
  bump() {
    tone("sine", 110, 80, 0.08, 0.12);
  },
  /** The key: a bright two-note ping. */
  key() {
    tone("sine", 1320, 1320, 0.12, 0.16);
    tone("sine", 1760, 1760, 0.22, 0.16, 0.09);
  },
  /** Ice letting go, or a padlock falling open. */
  free() {
    tone("triangle", 900, 1500, 0.09, 0.12);
    tone("triangle", 1500, 700, 0.16, 0.1, 0.07);
  },
  /** A cracked board giving way. */
  crack() {
    tone("sawtooth", 260, 70, 0.16, 0.12);
    tone("square", 140, 50, 0.22, 0.08, 0.05);
  },
  /** An egg cracking open. */
  peep() {
    tone("square", 1500, 1900, 0.05, 0.05);
    tone("sine", 1900, 2300, 0.09, 0.09, 0.05);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.22, 0.16, i * 0.11));
  },
  lose() {
    tone("sawtooth", 300, 120, 0.45, 0.1);
  },
};

export function buzz(ms: number) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
