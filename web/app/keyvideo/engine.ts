// The engine of the key video: paints one moment of a stage. The moments work like the site's scenes
// (site/scenes.js): an element with data-on="from-to,…" is shown in those spans, data-act="…" marks it active,
// data-type is typed out from data-at over data-dur. The pointer and the camera go to named targets
// (data-target="…"), measured from the layout, so one script fits both languages. Sounds are made on the spot with
// Web Audio (no files): a click, a key, a paste, a chime.

/** the pointer arrives at `to` at `at` (gliding for `move` ms, 900 by default), and clicks there at `click` */
export type Step = { at: number; to: string; click?: number; move?: number };
export type Shot = { at: number; d: number; s: number; to?: string };
export type Script = { w: number; h: number; len: number; start: { x: number; y: number }; path: Step[]; camera: Shot[]; sounds: { at: number; kind: Sound }[] };
export type Sound = "click" | "key" | "paste" | "chime";

const MOVE = 900, PRESS = 380;
const spans = (s: string) => s.split(",").map((p) => { const [a, b] = p.split("-"); return [Number(a), b ? Number(b) : Infinity] as const; });
const inSpans = (t: number, s: readonly (readonly [number, number])[]) => s.some(([a, b]) => t >= a && t < b);
const ease = (m: number) => (m < .5 ? 2 * m * m : 1 - Math.pow(-2 * m + 2, 2) / 2);

export function makeEngine(stage: HTMLElement, world: HTMLElement, cursor: HTMLElement, script: Script) {
  const shown = [...stage.querySelectorAll<HTMLElement>("[data-on]")].map((el) => ({ el, s: spans(el.dataset.on!) }));
  const active = [...stage.querySelectorAll<HTMLElement>("[data-act]")].map((el) => ({ el, s: spans(el.dataset.act!) }));
  const typed = [...stage.querySelectorAll<HTMLElement>("[data-type]")].map((el) => ({ el, at: Number(el.dataset.at) || 0, dur: Number(el.dataset.dur) || 1500, full: el.dataset.type! }));
  const { w: W, h: H } = script;
  let points: { at: number; x: number; y: number; click?: number; move: number }[] = [];
  let shots: { at: number; d: number; s: number; x: number; y: number }[] = [];

  /** the centre of a target in stage pixels: offsets ignore every transform (the camera, a dialog's entrance).
      A target must keep its layout while hidden (visibility, not display), or it would measure as the corner. */
  const where = (name: string) => {
    let el = stage.querySelector<HTMLElement>(`[data-target="${name}"]`);
    if (!el) return { x: W / 2, y: H / 2 };
    let x = el.offsetWidth / 2, y = el.offsetHeight / 2;
    while (el && el !== world) { x += el.offsetLeft; y += el.offsetTop; el = el.offsetParent as HTMLElement | null; }
    return { x, y };
  };
  function measure() {
    points = [{ at: 0, move: MOVE, ...script.start }, ...script.path.map((p) => ({ at: p.at, click: p.click, move: p.move ?? MOVE, ...where(p.to) }))];
    shots = script.camera.map((c) => ({ at: c.at, d: c.d, s: c.s, ...(c.to ? where(c.to) : { x: W / 2, y: H / 2 }) }));
  }

  /** the camera at t: from the previous shot to the current one over its d ms; the view never leaves the stage */
  function camera(t: number) {
    let i = 0;
    while (i + 1 < shots.length && shots[i + 1].at <= t) i++;
    const b = shots[i], a = shots[Math.max(0, i - 1)];
    const m = i === 0 ? 1 : ease(Math.min(1, (t - b.at) / Math.max(1, b.d)));
    const s = a.s + (b.s - a.s) * m;
    let x = a.x + (b.x - a.x) * m, y = a.y + (b.y - a.y) * m;
    x = Math.min(W - W / (2 * s), Math.max(W / (2 * s), x));
    y = Math.min(H - H / (2 * s), Math.max(H / (2 * s), y));
    world.style.transform = `translate(${W / 2 - x * s}px, ${H / 2 - y * s}px) scale(${s})`;
  }

  function classes(t: number) {
    for (const { el, s } of shown) el.classList.toggle("on", inSpans(t, s));
    for (const { el, s } of active) el.classList.toggle("act", inSpans(t, s));
  }
  function paint(t: number) {
    classes(t);
    for (const { el, at, dur, full } of typed) el.textContent = full.slice(0, Math.max(0, Math.min(full.length, Math.round(((t - at) / dur) * full.length))));
    // the pointer: still until it must leave, then a short glide to the next target
    let i = 0;
    while (i + 1 < points.length && points[i + 1].at - points[i + 1].move <= t) i++;
    const a = points[i], b = points[i + 1];
    let x = a.x, y = a.y;
    if (b && t > b.at - b.move) { const m = ease(Math.min(1, (t - (b.at - b.move)) / b.move)); x = a.x + (b.x - a.x) * m; y = a.y + (b.y - a.y) * m; }
    cursor.style.transform = `translate(${x}px, ${y}px)`;
    cursor.classList.toggle("press", points.some((p) => p.click !== undefined && t >= p.click && t < p.click + PRESS));
    camera(t);
  }

  /** every sound due between two moments, typed characters included */
  function soundsBetween(from: number, to: number): Sound[] {
    const out: Sound[] = [];
    for (const p of script.path) if (p.click !== undefined && p.click > from && p.click <= to) out.push("click");
    for (const s of script.sounds) if (s.at > from && s.at <= to) out.push(s.kind);
    for (const { at, dur, full } of typed) {
      if (to < at || from > at + dur) continue;
      const n = (u: number) => Math.max(0, Math.min(full.length, Math.round(((u - at) / dur) * full.length)));
      for (let k = n(from); k < n(to); k++) out.push("key");
    }
    return out;
  }

  // measured as the film opens: what is hidden then by display (an alternative label) is never a target
  classes(0);
  measure();
  return { measure, paint, soundsBetween };
}

/* ---------- the sounds ---------- */

let ctx: AudioContext | null = null;
/** made on the first play (a browser starts sound only after a gesture) */
export function audio() {
  if (!ctx) { try { ctx = new AudioContext(); } catch { ctx = null; } }
  if (ctx?.state === "suspended") void ctx.resume();
  return ctx;
}

export function play(kind: Sound) {
  const a = ctx;
  if (!a || a.state !== "running") return;
  const now = a.currentTime;
  const out = a.createGain();
  out.connect(a.destination);
  if (kind === "chime") {
    [660, 990].forEach((f, i) => {
      const o = a.createOscillator(), g = a.createGain();
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0, now + i * .12); g.gain.linearRampToValueAtTime(.12, now + i * .12 + .02); g.gain.exponentialRampToValueAtTime(.001, now + i * .12 + .5);
      o.connect(g); g.connect(out); o.start(now + i * .12); o.stop(now + i * .12 + .55);
    });
    return;
  }
  // a click, a key or a paste: a short burst of filtered noise
  const len = kind === "key" ? .025 : kind === "paste" ? .06 : .035;
  const buf = a.createBuffer(1, Math.ceil(a.sampleRate * len), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, kind === "key" ? 3 : 2);
  const src = a.createBufferSource(), f = a.createBiquadFilter();
  src.buffer = buf;
  f.type = "bandpass";
  // soft taps: low, quiet and short (the first version was harsh on a phone's speaker)
  f.frequency.value = kind === "key" ? 1400 + Math.random() * 600 : kind === "paste" ? 900 : 1100;
  f.Q.value = kind === "key" ? 1 : .7;
  out.gain.value = kind === "key" ? .08 : kind === "paste" ? .18 : .2;
  src.connect(f); f.connect(out); src.start(now);
}
