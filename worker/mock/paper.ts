// The paper builder (docs/MOCK-EXAM.md §6.2), pure: 39 questions by the official level quotas, drawn from the bank's
// key file, never one the person had in a previous mock while the level has fresh ones; when a level runs dry, the
// least recently seen come back first. Positions 1–4 A1 … 36–39 C2, shuffled inside each level.
import { LEVELS, type Level } from "../../shared/progress.ts";
import { QUOTA, type KeyRow } from "./types.ts";

/** `seen`: question id → the number of the mock it was last seen in (1 = the person's first mock: the oldest) */
export type Seen = Map<string, number>;

export function shuffle<T>(xs: T[], rnd: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export class PaperError extends Error {}

export function buildPaper(key: KeyRow[], seen: Seen, rnd: () => number = Math.random): KeyRow[] {
  const out: KeyRow[] = [];
  for (const level of LEVELS) {
    const rows = key.filter((k) => k.level === level && (k.answer === "A" || k.answer === "B" || k.answer === "C" || k.answer === "D"));
    const want = QUOTA[level];
    if (rows.length < want) throw new PaperError(`the bank has ${rows.length} ${level} questions, the paper needs ${want}`);
    const fresh = shuffle(rows.filter((r) => !seen.has(r.id)), rnd);
    const picked = fresh.slice(0, want);
    if (picked.length < want) {
      // the level ran dry: the ones seen longest ago come back first (ties shuffled)
      const old = shuffle(rows.filter((r) => seen.has(r.id)), rnd).sort((a, b) => seen.get(a.id)! - seen.get(b.id)!);
      picked.push(...old.slice(0, want - picked.length));
    }
    out.push(...shuffle(picked, rnd));
  }
  return out;
}

/** the ids of the person's previous papers → the seen map, from the papers in order (oldest first) */
export function seenOf(papers: { co: KeyRow[]; ce: KeyRow[] }[], section: "co" | "ce"): Seen {
  const m: Seen = new Map();
  papers.forEach((p, i) => { for (const q of p[section] ?? []) m.set(q.id, i + 1); });
  return m;
}

/** the level of a paper position 1 … 39 (the quotas in order) */
export function levelAt(position: number): Level {
  let n = 0;
  for (const level of LEVELS) { n += QUOTA[level]; if (position <= n) return level; }
  return "C2";
}
