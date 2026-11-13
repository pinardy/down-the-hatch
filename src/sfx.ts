// Tiny synthesized sound effects and a little background tune, generated with the Web Audio API
// so there is nothing to download. Everything goes through one master volume.

let ctx: AudioContext | null = null;
let enabled = true;
let master: GainNode | null = null;
let volume = 0.7;

/** Where every sound goes: the master volume, made on first use. */
function out(): AudioNode {
  if (!master) {
    master = ctx!.createGain();
    master.gain.value = volume;
    master.connect(ctx!.destination);
  }
  return master;
}

/** Overall loudness, from 0 to 1, for effects and music alike. */
export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (ctx && master) master.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
}

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
    startMusic();
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
  osc.connect(g).connect(out());
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

// ── Music ──
// A gentle loop in C major: a bass on the first and third beats, and a plucked tune over the
// chords C, Am, F, G, one bar each. The tune is two four-bar phrases, made up afresh from a
// pentatonic scale each time the music starts, so it doesn't wear thin.

const BPM = 96;
const EIGHTH = 60 / BPM / 2;
/** Chord roots (MIDI) and their tones, one per bar. */
const BARS = [
  { root: 48, tones: [60, 64, 67] }, // C
  { root: 45, tones: [57, 60, 64] }, // Am
  { root: 41, tones: [53, 57, 60] }, // F
  { root: 43, tones: [55, 59, 62] }, // G
];
const SCALE = [72, 74, 76, 79, 81, 84]; // C D E G A C, an octave up
const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

let musicOn = false;
let timer: number | null = null;
let musicGain: GainNode | null = null;
let nextTime = 0;
let stepAt = 0;
let tune: (number | null)[] = [];

/** Two four-bar phrases of eighth notes: chord tones on strong beats, scale steps between, some rests. */
function compose(): (number | null)[] {
  const phrase = () =>
    BARS.flatMap((bar) =>
      Array.from({ length: 8 }, (_, i) => {
        if (Math.random() < (i % 2 ? 0.55 : 0.25)) return null;
        if (i % 4 === 0) return bar.tones[Math.floor(Math.random() * 3)] + 12;
        return SCALE[Math.floor(Math.random() * SCALE.length)];
      }),
    );
  const a = phrase();
  const b = phrase();
  return [...a, ...b, ...a, ...b.slice(0, 24), ...a.slice(24)];
}

function pluck(midi: number, at: number, dur: number, wave: OscillatorType, gain: number) {
  const osc = ctx!.createOscillator();
  const g = ctx!.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(hz(midi), at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(musicGain!);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Line up the notes due in the next moment. Runs every 25 ms while the music plays. */
function schedule() {
  if (!ctx || !musicGain) return;
  while (nextTime < ctx.currentTime + 0.15) {
    const step = stepAt % tune.length;
    const bar = BARS[Math.floor(step / 8) % BARS.length];
    if (step % 4 === 0) pluck(bar.root, nextTime, EIGHTH * 3.5, "triangle", 0.16);
    const note = tune[step];
    if (note !== null) pluck(note, nextTime, EIGHTH * 1.6, "sine", 0.09);
    nextTime += EIGHTH;
    stepAt++;
  }
}

function startMusic() {
  if (!ctx || !musicOn || timer !== null || document.hidden) return;
  musicGain = ctx.createGain();
  musicGain.gain.setValueAtTime(0.0001, ctx.currentTime);
  musicGain.gain.exponentialRampToValueAtTime(0.55, ctx.currentTime + 1.5);
  musicGain.connect(out());
  tune = compose();
  nextTime = ctx.currentTime + 0.1;
  stepAt = 0;
  timer = window.setInterval(schedule, 25);
}

function stopMusic() {
  if (timer !== null) window.clearInterval(timer);
  timer = null;
  const fading = musicGain;
  musicGain = null;
  if (ctx && fading) {
    fading.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15);
    window.setTimeout(() => fading.disconnect(), 800);
  }
}

/** Background music on or off. It starts at the first tap, once the browser allows sound. */
export function setMusicEnabled(on: boolean) {
  musicOn = on;
  if (on) startMusic();
  else stopMusic();
}

// No music while the game is out of sight.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => (document.hidden ? stopMusic() : startMusic()));
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
  /** An egg landing on the win sheet: each a step higher. */
  egg(n: number) {
    const f = [660, 784, 988][Math.min(n, 2)];
    tone("triangle", f * 1.2, f, 0.12, 0.14);
  },
  /** Cleared, but not at par: a smaller flourish than the fanfare. */
  done() {
    tone("triangle", 523, 523, 0.16, 0.12);
    tone("triangle", 784, 784, 0.24, 0.12, 0.1);
  },
  /** A hatch sliding into a puddle of paint. */
  splash() {
    tone("sine", 700, 260, 0.14, 0.12);
    tone("triangle", 1200, 500, 0.1, 0.06, 0.04);
  },
  /** The gate swinging open, or dropping shut. */
  gate(open: boolean) {
    if (open) tone("square", 300, 520, 0.12, 0.06);
    else tone("square", 420, 180, 0.14, 0.07);
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone("triangle", f, f, 0.22, 0.16, i * 0.11));
  },
  lose() {
    tone("sawtooth", 300, 120, 0.45, 0.1);
  },
};

let vibrate = true;

export function setVibrationEnabled(on: boolean) {
  vibrate = on;
}

export function buzz(ms: number) {
  if (!vibrate) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported */
  }
}
