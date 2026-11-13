// The level editor: build a coop square by square, have the solver check it can be cleared and
// work out its par, then play it or send it to someone as a link.

import { useEffect, useMemo, useRef, useState } from "react";
import { parseLevel, startState, validate } from "../game/engine";
import { encodeLevel, LIMITS } from "../game/share";
import type { SharedLevel } from "../game/share";
import { COLORS } from "../game/types";
import type { Axis, Color, Feather, Level, LevelDef } from "../game/types";
import { BaleArt, ChickenArt, CrackArt, KeyArt, Mark, PAINT } from "./art";
import { Board } from "./Board";
import { solveInBackground } from "./solving";

interface DraftHatch {
  /** Stays with the hatch while others come and go, so a chain can point at it. */
  uid: number;
  color: Color;
  x: number;
  y: number;
  shape: string[];
  cap: number;
  axis?: Axis;
  ice?: number;
  locked?: boolean;
  /** The uid of the hatch this one is chained to. */
  link?: number;
}

export interface Draft {
  name: string;
  w: number;
  h: number;
  /** One character per square, row-major, as in levels.ts: . # ~ k r y t b p w R Y T B P W */
  cells: string[];
  hatches: DraftHatch[];
}

const DRAFT_KEY = "down-the-hatch:draft:v1";
const SEARCH = 1_500_000;

const blank = (w = 5, h = 5): Draft => ({ name: "My coop", w, h, cells: new Array(w * h).fill("."), hatches: [] });

export function loadDraft(): Draft {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? "null") as Draft | null;
    if (d && Array.isArray(d.cells) && d.cells.length === d.w * d.h && Array.isArray(d.hatches)) return d;
  } catch {
    /* fall through */
  }
  return blank();
}
function saveDraft(d: Draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* not saved: the editor still works */
  }
}

const SHAPES: string[][] = [["x"], ["xx"], ["x", "x"], ["xxx"], ["x", "x", "x"], ["xx", "xx"], ["x.", "xx"], [".x", "xx"], ["xx", "x."], ["xx", ".x"], ["xxx", ".x."], [".x.", "xxx"], ["x.", "xx", "x."], [".x", "xx", ".x"]];
const isRect = (shape: string[]) => shape.every((r) => !r.includes("."));
const cellsOf = (t: { x: number; y: number; shape: string[] }) => t.shape.flatMap((row, dy) => [...row].flatMap((c, dx) => (c === "x" ? [[t.x + dx, t.y + dy] as const] : [])));
const CHAR: Record<Feather, string> = { red: "r", gold: "y", teal: "t", blue: "b", plum: "p", any: "w" };
const FEATHER: Record<string, Feather> = { r: "red", y: "gold", t: "teal", b: "blue", p: "plum", w: "any" };

export function draftToDef(d: Draft): LevelDef {
  const rows = Array.from({ length: d.h }, (_, y) => d.cells.slice(y * d.w, (y + 1) * d.w).join(""));
  const hatches = d.hatches.map((t) => {
    const rect = isRect(t.shape);
    const partner = t.link === undefined ? undefined : d.hatches.find((o) => o.uid === t.link);
    return {
      color: t.color,
      x: t.x,
      y: t.y,
      ...(rect ? { w: t.shape[0].length, h: t.shape.length } : { shape: t.shape }),
      cap: t.cap,
      ...(t.axis && rect ? { axis: t.axis } : {}),
      ...(t.ice ? { ice: t.ice } : {}),
      ...(t.locked ? { locked: true } : {}),
      ...(partner ? { link: `c${Math.min(t.uid, partner.uid)}` } : {}),
    };
  });
  return { id: "draft", name: d.name.trim() || "My coop", rows, hatches, par: 0 };
}

/** Plain-words reasons the draft is not a fair level yet. Empty when it is. */
function problems(d: Draft): string[] {
  const out: string[] = [];
  const birds = d.cells.filter((c) => FEATHER[c.toLowerCase()]);
  if (!d.hatches.length) out.push("Add at least one hatch.");
  if (!birds.length) out.push("Add some chickens.");
  if (birds.length > LIMITS.chickens) out.push(`At most ${LIMITS.chickens} chickens, please: there are ${birds.length}.`);
  if (d.hatches.length > LIMITS.hatches) out.push(`At most ${LIMITS.hatches} hatches, please.`);
  for (const color of COLORS) {
    const n = birds.filter((c) => FEATHER[c.toLowerCase()] === color).length;
    const room = d.hatches.filter((t) => t.color === color).reduce((s, t) => s + t.cap, 0);
    if (n > room) out.push(room ? `${n} ${PAINT[color].name} chickens, but the ${PAINT[color].name} hatches only have room for ${room}.` : `${n} ${PAINT[color].name} ${n === 1 ? "chicken needs" : "chickens need"} a ${PAINT[color].name} hatch.`);
  }
  const room = d.hatches.reduce((s, t) => s + t.cap, 0);
  if (birds.length && room > birds.length) out.push(`The hatches have room for ${room}, but there ${birds.length === 1 ? "is" : "are"} only ${birds.length} ${birds.length === 1 ? "chicken" : "chickens"}. Lower a number, or add chickens (white ones fit any hatch).`);
  else if (room < birds.length && !out.some((p) => p.includes("room for") || p.includes("needs") || p.includes("need a"))) out.push(`${birds.length} chickens, but the hatches only have room for ${room}.`);
  if (d.hatches.some((t) => t.locked) && !d.cells.includes("k")) out.push("A padlocked hatch needs a key on the board.");
  for (const t of d.hatches) if (t.ice && t.ice > birds.length - t.cap) out.push(`A frozen ${PAINT[t.color].name} hatch needs ${t.ice} other chickens to drop first, and there aren’t that many.`);
  return out;
}

type Tool = "select" | "erase" | "bale" | "crack" | "key" | "chicken" | "hatch";
type Check = { status: "idle" | "checking" } | { status: "solved"; par: number } | { status: "stuck" | "unknown" };

interface Props {
  draft: Draft;
  onDraft: (d: Draft) => void;
  onBack: () => void;
  /** Play the checked level. */
  onPlay: (level: SharedLevel) => void;
}

export function Editor({ draft, onDraft, onBack, onPlay }: Props) {
  const [tool, setTool] = useState<Tool>("chicken");
  const [feather, setFeather] = useState<Feather>("red");
  const [egg, setEgg] = useState(false);
  const [hatchColor, setHatchColor] = useState<Color>("red");
  const [shape, setShape] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [linking, setLinking] = useState(false);
  const [check, setCheck] = useState<Check>({ status: "idle" });
  const [said, setSaid] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  /** "Clear board" asks once before wiping the work. */
  const [sure, setSure] = useState(false);

  const change = (d: Draft) => {
    saveDraft(d);
    onDraft(d);
    setCheck({ status: "idle" });
    setLink(null);
    setSaid(null);
  };

  const def = useMemo(() => draftToDef(draft), [draft]);
  const level: Level = useMemo(() => parseLevel(def, -3, "", false), [def]);
  const issues = problems(draft);
  const sel = draft.hatches.find((t) => t.uid === selected) ?? null;

  // Fit the board to the width it has.
  const stageRef = useRef<HTMLDivElement>(null);
  const [cell, setCell] = useState(48);
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const fit = () => setCell(Math.max(30, Math.min(60, Math.floor((el.clientWidth - 28) / draft.w))));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [draft.w]);

  const hatchAt = (x: number, y: number) => draft.hatches.find((t) => cellsOf(t).some(([cx, cy]) => cx === x && cy === y));
  const fits = (t: { x: number; y: number; shape: string[] }, ignore?: number) =>
    cellsOf(t).every(([x, y]) => x >= 0 && y >= 0 && x < draft.w && y < draft.h && draft.cells[y * draft.w + x] === "." && !draft.hatches.some((o) => o.uid !== ignore && cellsOf(o).some(([ox, oy]) => ox === x && oy === y)));

  const removeHatch = (uid: number) =>
    change({ ...draft, hatches: draft.hatches.filter((t) => t.uid !== uid).map((t) => (t.link === uid ? { ...t, link: undefined } : t)) });
  const updateHatch = (uid: number, patch: Partial<DraftHatch>) => change({ ...draft, hatches: draft.hatches.map((t) => (t.uid === uid ? { ...t, ...patch } : t)) });

  const tap = (x: number, y: number) => {
    const k = y * draft.w + x;
    const here = hatchAt(x, y);
    if (linking && sel) {
      setLinking(false);
      if (!here || here.uid === sel.uid) return;
      // Chain the two, unchaining whatever either was chained to before.
      const old = [sel.link, here.link];
      change({
        ...draft,
        hatches: draft.hatches.map((t) => (t.uid === sel.uid ? { ...t, link: here.uid } : t.uid === here.uid ? { ...t, link: sel.uid } : old.includes(t.uid) ? { ...t, link: undefined } : t)),
      });
      return;
    }
    if (tool === "erase") {
      if (here) {
        removeHatch(here.uid);
        if (selected === here.uid) setSelected(null);
      } else if (draft.cells[k] !== ".") change({ ...draft, cells: draft.cells.map((c, i) => (i === k ? "." : c)) });
      return;
    }
    if (here) return setSelected(here.uid === selected && tool === "select" ? null : here.uid);
    if (tool === "select") return setSelected(null);
    if (tool === "hatch") {
      const t: DraftHatch = { uid: Math.max(0, ...draft.hatches.map((o) => o.uid)) + 1, color: hatchColor, x, y, shape: SHAPES[shape], cap: 1 };
      if (draft.hatches.length >= LIMITS.hatches) return setSaid(`At most ${LIMITS.hatches} hatches.`);
      if (!fits(t)) return setSaid("No room for that shape there: it needs empty floor under every square.");
      change({ ...draft, hatches: [...draft.hatches, t] });
      setSelected(t.uid);
      return;
    }
    const put = tool === "bale" ? "#" : tool === "crack" ? "~" : tool === "key" ? "k" : egg ? CHAR[feather].toUpperCase() : CHAR[feather];
    const cells = draft.cells.map((c, i) => (i === k ? (c === put ? "." : put) : tool === "key" && c === "k" ? "." : c));
    change({ ...draft, cells });
  };

  const resize = (w: number, h: number) => {
    if (w < LIMITS.minW || w > LIMITS.maxW || h < LIMITS.minH || h > LIMITS.maxH) return;
    const cells = Array.from({ length: w * h }, (_, i) => {
      const x = i % w;
      const y = Math.floor(i / w);
      return x < draft.w && y < draft.h ? draft.cells[y * draft.w + x] : ".";
    });
    const keep = draft.hatches.filter((t) => cellsOf(t).every(([x, y]) => x < w && y < h));
    const kept = new Set(keep.map((t) => t.uid));
    change({ ...draft, w, h, cells, hatches: keep.map((t) => (t.link !== undefined && !kept.has(t.link) ? { ...t, link: undefined } : t)) });
  };

  const nudge = (dx: number, dy: number) => {
    if (!sel) return;
    const moved = { ...sel, x: sel.x + dx, y: sel.y + dy };
    if (fits(moved, sel.uid)) updateHatch(sel.uid, { x: moved.x, y: moved.y });
  };

  const runCheck = async () => {
    try {
      const fair = parseLevel(def, -3, "", false);
      validate(fair);
      setCheck({ status: "checking" });
      const r = await solveInBackground(fair, startState(fair), SEARCH);
      setCheck(r.status === "solved" ? { status: "solved", par: r.moves } : { status: r.status });
    } catch (e) {
      setCheck({ status: "idle" });
      setSaid(String(e instanceof Error ? e.message : e).replace(/^[^:]*: /, ""));
    }
  };

  const shared = (): SharedLevel | null => (check.status === "solved" ? { name: def.name, rows: def.rows, hatches: def.hatches, par: check.par } : null);

  const share = async () => {
    const s = shared();
    if (!s) return;
    const url = `${location.origin}${location.pathname}#play=${encodeLevel(s)}`;
    setLink(url);
    try {
      if (navigator.share) {
        await navigator.share({ title: `Down the Hatch: ${s.name}`, text: `Can you clear my coop in ${s.par} moves?`, url });
        return;
      }
    } catch {
      /* cancelled, or not allowed: fall back to copying */
    }
    try {
      await navigator.clipboard.writeText(url);
      setSaid("Link copied. Anyone who opens it can play your coop.");
    } catch {
      setSaid("Copy the link below and send it to someone.");
    }
  };

  const chip = (on: boolean) => (on ? "chip chip--on" : "chip");

  return (
    <main className="screen editor">
      <header className="editor__top">
        <button type="button" className="btn btn--quiet" onClick={onBack}>
          Levels
        </button>
        <input className="editor__name" value={draft.name} maxLength={40} onChange={(e) => change({ ...draft, name: e.target.value })} aria-label="Name of your coop" />
      </header>

      <div className="editor__size">
        <span>
          Width
          <button type="button" className="btn btn--small" onClick={() => resize(draft.w - 1, draft.h)} disabled={draft.w <= LIMITS.minW} aria-label="Narrower">
            −
          </button>
          <b>{draft.w}</b>
          <button type="button" className="btn btn--small" onClick={() => resize(draft.w + 1, draft.h)} disabled={draft.w >= LIMITS.maxW} aria-label="Wider">
            +
          </button>
        </span>
        <span>
          Height
          <button type="button" className="btn btn--small" onClick={() => resize(draft.w, draft.h - 1)} disabled={draft.h <= LIMITS.minH} aria-label="Shorter">
            −
          </button>
          <b>{draft.h}</b>
          <button type="button" className="btn btn--small" onClick={() => resize(draft.w, draft.h + 1)} disabled={draft.h >= LIMITS.maxH} aria-label="Taller">
            +
          </button>
        </span>
      </div>

      <div className="editor__stage" ref={stageRef}>
        <div className="editor__board">
          <Board level={level} game={startState(level)} cell={cell} drops={[]} shuts={[]} hint={null} bump={null} demo={null} seen={new Set(level.chickens.map((c) => c.id))} locked held={null} onGrab={() => {}} onDrag={() => {}} onRelease={() => {}} onNudge={() => {}} />
          <div className="editor__taps" style={{ gridTemplateColumns: `repeat(${draft.w}, ${cell}px)`, gridAutoRows: `${cell}px` }}>
            {draft.cells.map((c, k) => {
              const x = k % draft.w;
              const y = Math.floor(k / draft.w);
              const mine = sel && cellsOf(sel).some(([cx, cy]) => cx === x && cy === y);
              return (
                <button key={k} type="button" className={mine ? "editor__tap editor__tap--sel" : "editor__tap"} onClick={() => tap(x, y)} aria-label={`Square ${x + 1}, ${y + 1}`}>
                  {/* Eggs show their colour here, so mark which chickens are still in their eggs. */}
                  {c !== c.toLowerCase() && <span className="editor__egg">egg</span>}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {linking ? (
        <p className="editor__hint">Tap the hatch to chain it to.</p>
      ) : (
        sel && (
          <section className="editor__panel" aria-label="Selected hatch">
            <div className="editor__row">
              {COLORS.map((c) => (
                <button key={c} type="button" className={chip(sel.color === c)} onClick={() => updateHatch(sel.uid, { color: c })} aria-label={PAINT[c].name}>
                  <svg viewBox="0 0 24 24" className="chip__mark" aria-hidden="true">
                    <Mark color={c} cx={12} cy={12} r={7} fill={PAINT[c].frame} />
                  </svg>
                </button>
              ))}
            </div>
            <div className="editor__row">
              <span className="editor__label">Room</span>
              <button type="button" className="btn btn--small" onClick={() => updateHatch(sel.uid, { cap: Math.max(1, sel.cap - 1) })} aria-label="Less room">
                −
              </button>
              <b>{sel.cap}</b>
              <button type="button" className="btn btn--small" onClick={() => updateHatch(sel.uid, { cap: Math.min(12, sel.cap + 1) })} aria-label="More room">
                +
              </button>
              <span className="editor__label">Frozen</span>
              <button type="button" className="btn btn--small" onClick={() => updateHatch(sel.uid, { ice: Math.max(0, (sel.ice ?? 0) - 1) || undefined })} aria-label="Thaw sooner">
                −
              </button>
              <b>{sel.ice ?? 0}</b>
              <button type="button" className="btn btn--small" onClick={() => updateHatch(sel.uid, { ice: Math.min(20, (sel.ice ?? 0) + 1) })} aria-label="Thaw later">
                +
              </button>
            </div>
            <div className="editor__row">
              <button type="button" className={chip(!!sel.locked)} onClick={() => updateHatch(sel.uid, { locked: !sel.locked || undefined })}>
                Padlock
              </button>
              {isRect(sel.shape) && (
                <>
                  <button type="button" className={chip(sel.axis === "h")} onClick={() => updateHatch(sel.uid, { axis: sel.axis === "h" ? undefined : "h" })}>
                    Rails ↔
                  </button>
                  <button type="button" className={chip(sel.axis === "v")} onClick={() => updateHatch(sel.uid, { axis: sel.axis === "v" ? undefined : "v" })}>
                    Rails ↕
                  </button>
                </>
              )}
              {sel.link !== undefined ? (
                <button type="button" className="chip chip--on" onClick={() => change({ ...draft, hatches: draft.hatches.map((t) => (t.uid === sel.uid || t.uid === sel.link ? { ...t, link: undefined } : t)) })}>
                  Unchain
                </button>
              ) : (
                <button type="button" className="chip" onClick={() => setLinking(true)} disabled={draft.hatches.length < 2}>
                  Chain to…
                </button>
              )}
            </div>
            <div className="editor__row">
              <span className="editor__label">Move</span>
              {(
                [
                  ["←", -1, 0],
                  ["↑", 0, -1],
                  ["↓", 0, 1],
                  ["→", 1, 0],
                ] as const
              ).map(([a, dx, dy]) => (
                <button key={a} type="button" className="btn btn--small" onClick={() => nudge(dx, dy)} aria-label={`Move ${a}`}>
                  {a}
                </button>
              ))}
              <button
                type="button"
                className="btn btn--small btn--quiet editor__delete"
                onClick={() => {
                  removeHatch(sel.uid);
                  setSelected(null);
                }}
              >
                Delete
              </button>
              <button type="button" className="btn btn--small" onClick={() => setSelected(null)}>
                Done
              </button>
            </div>
          </section>
        )
      )}

      <section className="editor__tools" aria-label="Tools">
        <div className="editor__row">
          {(
            [
              ["chicken", "Chicken"],
              ["hatch", "Hatch"],
              ["bale", "Hay"],
              ["crack", "Crack"],
              ["key", "Key"],
              ["select", "Select"],
              ["erase", "Erase"],
            ] as const
          ).map(([t, label]) => (
            <button key={t} type="button" className={chip(tool === t)} onClick={() => setTool(t)}>
              {t === "bale" ? <BaleArt /> : t === "crack" ? <CrackArt /> : t === "key" ? <KeyArt /> : t === "chicken" ? <ChickenArt color={feather} /> : null}
              {label}
            </button>
          ))}
        </div>
        {tool === "chicken" && (
          <div className="editor__row">
            {[...COLORS, "any" as const].map((c) => (
              <button key={c} type="button" className={chip(feather === c)} onClick={() => setFeather(c)} aria-label={PAINT[c].name}>
                <ChickenArt color={c} hat="none" />
              </button>
            ))}
            <button type="button" className={chip(egg)} onClick={() => setEgg(!egg)}>
              In an egg
            </button>
          </div>
        )}
        {tool === "hatch" && (
          <>
            <div className="editor__row">
              {COLORS.map((c) => (
                <button key={c} type="button" className={chip(hatchColor === c)} onClick={() => setHatchColor(c)} aria-label={PAINT[c].name}>
                  <svg viewBox="0 0 24 24" className="chip__mark" aria-hidden="true">
                    <Mark color={c} cx={12} cy={12} r={7} fill={PAINT[c].frame} />
                  </svg>
                </button>
              ))}
            </div>
            <div className="editor__row">
              {SHAPES.map((s, i) => (
                <button key={i} type="button" className={chip(shape === i)} onClick={() => setShape(i)} aria-label={`Shape ${i + 1}`}>
                  <svg viewBox={`-1 -1 ${s[0].length * 10 + 1} ${s.length * 10 + 1}`} className="chip__shape" aria-hidden="true">
                    {s.flatMap((row, y) => [...row].map((ch, x) => (ch === "x" ? <rect key={`${x},${y}`} x={x * 10} y={y * 10} width="9" height="9" rx="2" fill={PAINT[hatchColor].frame} /> : null)))}
                  </svg>
                </button>
              ))}
            </div>
          </>
        )}
        <p className="editor__hint">
          {tool === "hatch" ? "Tap a square to put the hatch’s top-left corner there. Tap a hatch to change it." : tool === "select" ? "Tap a hatch to change it." : tool === "erase" ? "Tap anything to remove it." : "Tap a square to place, tap again to remove."}
        </p>
      </section>

      <section className="editor__check" aria-live="polite">
        {issues.length > 0 ? (
          <ul className="editor__issues">
            {issues.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : check.status === "solved" ? (
          <p className="editor__ok">
            It can be cleared. Par is <b>{check.par}</b> {check.par === 1 ? "move" : "moves"}.
          </p>
        ) : check.status === "stuck" ? (
          <p className="editor__bad">There’s no way to clear this coop. Change something and check again.</p>
        ) : check.status === "unknown" ? (
          <p className="editor__bad">Too many ways to try: the checker gave up. Make the coop smaller or simpler.</p>
        ) : (
          <p className="editor__hint">Ready to check. The checker finds the fewest moves, which becomes the par.</p>
        )}
        <div className="editor__row">
          {check.status === "solved" ? (
            <>
              <button type="button" className="btn btn--straw" onClick={() => onPlay(shared()!)}>
                Play it
              </button>
              <button type="button" className="btn" onClick={share}>
                Share
              </button>
            </>
          ) : (
            <button type="button" className="btn btn--straw" onClick={runCheck} disabled={issues.length > 0 || check.status === "checking"}>
              {check.status === "checking" ? "Checking…" : "Check it"}
            </button>
          )}
          <button
            type="button"
            className={sure ? "btn btn--warn" : "btn btn--quiet"}
            onClick={() => {
              if (!sure) return setSure(true);
              setSure(false);
              setSelected(null);
              change(blank(draft.w, draft.h));
            }}
            onBlur={() => setSure(false)}
          >
            {sure ? "Tap again to clear" : "Clear board"}
          </button>
        </div>
        {said && <p className="editor__said">{said}</p>}
        {link && <textarea className="keeping__code" readOnly rows={3} value={link} aria-label="Link to your coop" onFocus={(e) => e.currentTarget.select()} />}
      </section>
    </main>
  );
}
