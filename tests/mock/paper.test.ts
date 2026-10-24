// The paper builder: the quotas, never a question of a previous mock while there are fresh ones, the oldest back first
// when a level runs dry, a bank too small refused.
import { describe, it, expect } from "vitest";
import { buildPaper, seenOf, levelAt, PaperError } from "../../worker/mock/paper.ts";
import { QUOTA, type KeyRow } from "../../worker/mock/types.ts";
import { LEVELS } from "../../shared/progress.ts";

const key = (n: Record<string, number>): KeyRow[] => LEVELS.flatMap((lv) => Array.from({ length: n[lv] ?? 0 }, (_, i) => ({ id: `${lv}-${i + 1}`, level: lv, answer: "A" as const })));
// a deterministic random: a small linear generator
const rng = (seed: number) => () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

describe("buildPaper", () => {
  it("39 questions by the official quotas, in position order, all distinct", () => {
    const p = buildPaper(key({ A1: 10, A2: 10, B1: 20, B2: 20, C1: 10, C2: 10 }), new Map(), rng(1));
    expect(p).toHaveLength(39);
    expect(new Set(p.map((q) => q.id)).size).toBe(39);
    p.forEach((q, i) => expect(q.level).toBe(levelAt(i + 1)));
    for (const lv of LEVELS) expect(p.filter((q) => q.level === lv)).toHaveLength(QUOTA[lv]);
  });

  it("skips the questions of previous mocks while the level has fresh ones", () => {
    const k = key({ A1: 8, A2: 12, B1: 18, B2: 30, C1: 12, C2: 8 });
    const first = buildPaper(k, new Map(), rng(2));
    const seen = seenOf([{ co: first, ce: [] }], "co");
    const second = buildPaper(k, seen, rng(3));
    for (const q of second) expect(seen.has(q.id), q.id).toBe(false);
    // the third time A1 (8 questions, 4 a paper) and C2 are dry: the first mock's come back, never the second's
    const seen2 = seenOf([{ co: first, ce: [] }, { co: second, ce: [] }], "co");
    const third = buildPaper(k, seen2, rng(4));
    expect(third).toHaveLength(39);
    const a1 = third.filter((q) => q.level === "A1");
    expect(a1.every((q) => seen2.get(q.id) === 1)).toBe(true);
    expect(third.filter((q) => q.level === "B2").every((q) => !seen2.has(q.id))).toBe(true);
  });

  it("a level with fewer questions than its quota is refused; a bad answer letter is left out", () => {
    expect(() => buildPaper(key({ A1: 3, A2: 6, B1: 9, B2: 10, C1: 6, C2: 4 }), new Map())).toThrow(PaperError);
    const k = key({ A1: 4, A2: 6, B1: 9, B2: 10, C1: 6, C2: 4 });
    (k[0] as { answer: string }).answer = "E";
    expect(() => buildPaper(k, new Map())).toThrow(PaperError);
  });

  it("seenOf numbers the mocks oldest first, the newest number winning for a question seen twice", () => {
    const q = { id: "x", level: "A1" as const, answer: "A" as const };
    const m = seenOf([{ co: [q], ce: [] }, { co: [], ce: [q] }, { co: [q], ce: [] }], "co");
    expect(m.get("x")).toBe(3);
    expect(seenOf([{ co: [q], ce: [] }], "ce").size).toBe(0);
  });
});
