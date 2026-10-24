// The one set of rules for practice progress (CO · CE), run in the browser (at once) and in the Worker (to store it):
// plain TypeScript, no imports, so both load it as it is (docs/COCE.md §2).
//
// A person's progress in one level is one small State, stored as one row of `progress`. It changes only through
// events; an event applies only when its `t` is strictly after the entry's, so applying a bundle twice changes nothing.

export type Section = "co" | "ce";
export type Level = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
export type Key = "A" | "B" | "C" | "D";
export type Colour = "green" | "red" | "amber";

export const LEVELS: readonly Level[] = ["A1", "A2", "B1", "B2", "C1", "C2"];
/** points one right answer of the level is worth in an exam (699 in all) */
export const POINTS: Record<Level, number> = { A1: 3, A2: 9, B1: 15, B2: 21, C1: 26, C2: 33 };
/** questions of each level in an exam of 39 */
export const EXAM_COUNT: Record<Level, number> = { A1: 4, A2: 6, B1: 9, B2: 10, C1: 6, C2: 4 };

/** the level of an exam position 1…39 (1–4 A1, 5–10 A2, 11–19 B1, 20–29 B2, 30–35 C1, 36–39 C2) */
export function levelOfPosition(pos: number): Level {
  if (pos <= 4) return "A1";
  if (pos <= 10) return "A2";
  if (pos <= 19) return "B1";
  if (pos <= 29) return "B2";
  if (pos <= 35) return "C1";
  return "C2";
}

export type Entry = {
  /** the colour */
  s: Colour;
  /** seconds since epoch of the last event that touched it */
  t: number;
  /** the last answer given, null after a mark by hand on a question that had none */
  a: Key | null;
};

export type State = {
  v: 1;
  q: Record<string, Entry>;
  /** the last question number opened, null when none */
  pos: number | null;
  /**
   * questions reset by hand, with the second of the reset: an older answer that arrives later (a phone that was
   * offline, a bundle sent twice) must not bring the question back. Gone again at the next answer. Absent in old rows.
   */
  x?: Record<string, number>;
};

export type EventType = "answer" | "mark" | "reset" | "pos";

export type Event = {
  /** uuid from the browser; the Worker drops repeats only through the `t` rule */
  id: string;
  section: Section;
  level: Level;
  /** seconds since epoch */
  t: number;
  type: EventType;
  /** answer · mark · reset */
  qid?: string;
  /** answer */
  key?: Key;
  right?: boolean;
  /** mark */
  s?: "green" | "amber";
  /** pos */
  n?: number;
  /** answer, optional: seconds spent on the question (the Worker counts it in practice_days, capped) */
  dt?: number;
};

export const emptyState = (): State => ({ v: 1, q: {}, pos: null });

/**
 * The same state with one entry changed, or removed when `entry` is null (then `at` is the second of the reset, kept
 * in `x` so that an older answer arriving later changes nothing). A new entry forgets the reset.
 */
function withEntry(state: State, qid: string, entry: Entry | null, at = 0): State {
  const q = { ...state.q };
  const x = { ...(state.x ?? {}) };
  if (entry) { q[qid] = entry; delete x[qid]; } else { delete q[qid]; x[qid] = at; }
  const next: State = { ...state, q };
  if (Object.keys(x).length) next.x = x; else delete next.x;
  return next;
}

/**
 * One event on one level's state. Pure: returns a new object when something changed and the very same object when
 * nothing did (a repeat, an older event, or a rule that ignores it).
 */
export function apply(state: State, e: Event): State {
  if (e.type === "pos") {
    const n = e.n;
    if (typeof n !== "number" || !Number.isFinite(n) || n === state.pos) return state;
    return { ...state, pos: n };
  }
  const qid = e.qid;
  if (typeof qid !== "string" || !qid) return state;
  const cur = state.q[qid];
  if (cur && !(e.t > cur.t)) return state;
  // reset at `gone`: only something strictly later than the reset counts
  const gone = state.x?.[qid];
  if (gone !== undefined && !(e.t > gone)) return state;

  if (e.type === "answer") {
    const key = e.key ?? null;
    if (!cur) return withEntry(state, qid, { s: e.right ? "green" : "red", t: e.t, a: key });
    if (cur.s === "red") return withEntry(state, qid, { s: e.right ? "amber" : "red", t: e.t, a: key });
    return state; // green or amber: already learned
  }
  if (e.type === "mark") {
    if (!cur || cur.s === "red" || (e.s !== "green" && e.s !== "amber")) return state;
    return withEntry(state, qid, { s: e.s, t: e.t, a: cur.a });
  }
  if (e.type === "reset") {
    if (!cur) return state;
    return withEntry(state, qid, null, e.t);
  }
  return state;
}

/** how many of the level's `n` questions are in each colour; grey is the rest */
export function counts(state: State, n: number): { green: number; red: number; amber: number; grey: number } {
  let green = 0, red = 0, amber = 0;
  for (const k in state.q) {
    const s = state.q[k].s;
    if (s === "green") green++; else if (s === "red") red++; else if (s === "amber") amber++;
  }
  return { green, red, amber, grey: Math.max(0, n - green - red - amber) };
}
