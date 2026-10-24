// Short, soft tones made with the Web Audio API (no files): on an answer in practice, two quick ascending notes when
// right, one low note when wrong (never in exams: the exam room does not call this); in the hallway, one tick on each
// number of the 3 · 2 · 1 and a higher, longer one at the start. Silent when the device prefers reduced motion or has
// no audio context.
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) { try { ctx = new AC(); } catch { return null; } }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

const quiet = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function note(c: AudioContext, at: number, hz: number, ms: number, type: OscillatorType, peak: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(hz, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + ms / 1000);
  o.connect(g).connect(c.destination);
  o.start(at);
  o.stop(at + ms / 1000 + 0.02);
}

/** play the tone for an answer; does nothing when sound is not wanted or not possible */
export function playAnswerTone(right: boolean) {
  if (quiet()) return;
  const c = context();
  if (!c) return;
  const t = c.currentTime + 0.01;
  if (right) {
    note(c, t, 660, 110, "sine", 0.06);
    note(c, t + 0.11, 880, 150, "sine", 0.06);
  } else {
    note(c, t, 220, 200, "triangle", 0.05);
  }
}

/** the hallway's count: a tick on 3, 2 and 1, a higher and longer tone at 0 (the start) */
export function playCount(n: number) {
  if (quiet()) return;
  const c = context();
  if (!c) return;
  const t = c.currentTime + 0.01;
  if (n > 0) note(c, t, 880, 140, "sine", 0.07);
  else { note(c, t, 1320, 220, "sine", 0.08); note(c, t + 0.16, 1760, 260, "sine", 0.06); }
}

/** the end of a break in the mock exam: two rising notes, a little longer than the hallway's start */
export function playChime() {
  if (quiet()) return;
  const c = context();
  if (!c) return;
  const t = c.currentTime + 0.01;
  note(c, t, 880, 220, "sine", 0.08);
  note(c, t + 0.22, 1320, 320, "sine", 0.08);
  note(c, t + 0.5, 1760, 420, "sine", 0.06);
}
