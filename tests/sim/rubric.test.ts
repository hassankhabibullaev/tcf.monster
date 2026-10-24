import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RUBRIC, applyCaps, scoreFromCriteria } from "../../worker/sim/eval/rubric.ts";
import { RUBRIC_MD } from "../../worker/sim/rubric-md.ts";
import { ANCHORS } from "../../worker/sim/eval/anchors.ts";
import { nclcFor, targetStatus } from "../../worker/sim/config.ts";

const md = readFileSync(resolve(__dirname, "../../docs/rubric.md"), "utf8");

describe("rubric", () => {
  it("the text loaded into the scorer's prompt is docs/rubric.md", () => {
    expect(RUBRIC_MD).toBe(md);
  });
  it("every criterion of eval/rubric.ts is documented in docs/rubric.md", () => {
    for (const skill of ["writing", "speaking"] as const)
      for (const task of [1, 2, 3] as const)
        for (const c of RUBRIC[skill][task]) expect(md, `${skill} T${task}: ${c.name}`).toContain(`**${c.name}**`);
  });
  it("has 2–3 anchors per task", () => {
    for (const skill of ["writing", "speaking"] as const) for (const task of [1, 2, 3] as const) expect(ANCHORS[skill][task].length).toBeGreaterThanOrEqual(2);
  });
});

const all = (skill: "writing" | "speaking", task: 1 | 2 | 3, score: number, only?: "transcript") =>
  scoreFromCriteria(skill, task, RUBRIC[skill][task].filter((c) => !only || c.source === only).map((c) => ({ name: c.name, score })));

describe("criteria /20 → task score", () => {
  it("uniform scores give that score, in the right CECRL level", () => {
    expect(Math.round(all("writing", 1, 8).score20)).toBe(8);
    expect(nclcFor(8, "writing").cecrl).toBe("B1");
    expect(Math.round(all("speaking", 3, 12).score20)).toBe(12);
    expect(nclcFor(12, "speaking").cecrl).toBe("B2");
    expect(all("writing", 2, 0).score20).toBe(0);
  });
  it("speaking: fluency and pronunciation stay locked until the recording is analysed", () => {
    for (const task of [1, 2, 3] as const) {
      const first = all("speaking", task, 11, "transcript");
      expect(first.locked).toEqual(["Fluency", "Pronunciation"]);
      expect(first.criteria.every((c) => c.source === "transcript")).toBe(true);
      expect(all("speaking", task, 11).locked).toEqual([]);
    }
    for (const task of [1, 2, 3] as const) expect(all("writing", task, 11).locked).toEqual([]);
  });
  it("language ceiling: a perfectly led task does not lift a B1 speaker into B2+", () => {
    const given = [
      { name: "Task completion", score: 20 },
      { name: "Vocabulary", score: 10 },
      { name: "Grammar", score: 9 },
      { name: "Fluency", score: 9 },
      { name: "Pronunciation", score: 10 },
    ];
    const r = scoreFromCriteria("speaking", 2, given);
    expect(r.languageAverage).toBe(9.5);
    const q = r.criteria.find((c) => c.name === "Task completion")!;
    expect(q.score).toBe(12.5);
    expect(q.cappedFrom).toBe(20);
    expect(r.criteria.find((c) => c.name === "Grammar")!.cappedFrom).toBeUndefined();
    expect(Math.round(r.score20)).toBe(10);
    // a plain weighted mean would have said 12
    expect(Math.round((20 * 1.5 + 10 + 9 * 1.5 + 9 + 10) / 6)).toBe(12);
  });
  it("the ceiling never lowers language criteria and does nothing when task and language agree", () => {
    const r = all("speaking", 1, 11);
    expect(r.ceilingApplied).toBe(false);
    expect(r.criteria.every((c) => c.cappedFrom == null)).toBe(true);
    // good French, weak task: no ceiling effect (the non-fulfilment caps handle that direction)
    const weakTask = scoreFromCriteria("speaking", 2, [{ name: "Task completion", score: 6 }, { name: "Organization", score: 6 }, { name: "Vocabulary", score: 14 }, { name: "Grammar", score: 14 }]);
    expect(weakTask.ceilingApplied).toBe(false);
    expect(weakTask.score20).toBeCloseTo((6 * 1 + 6 * 0.5 + 14 + 14 * 1.5) / 4);
  });
  it("the full analysis can lower the transcript estimate when delivery is weaker than the text", () => {
    const text = [{ name: "Task completion", score: 12 }, { name: "Vocabulary", score: 11 }, { name: "Grammar", score: 11 }];
    const before = Math.round(scoreFromCriteria("speaking", 1, text).score20);
    const after = Math.round(scoreFromCriteria("speaking", 1, [...text, { name: "Fluency", score: 7 }, { name: "Pronunciation", score: 7 }]).score20);
    expect(before).toBe(11);
    expect(after).toBe(10);
  });
  it("language rows weigh three quarters of a speaking mark", () => {
    const w = RUBRIC.speaking[1];
    const lang = w.filter((c) => c.kind === "language").reduce((n, c) => n + c.weight, 0);
    expect(lang / w.reduce((n, c) => n + c.weight, 0)).toBe(0.75);
    for (const t of [1, 2, 3] as const) expect(RUBRIC.speaking[t].map((c) => c.name)).toEqual(["Task completion", "Organization", "Vocabulary", "Grammar", "Fluency", "Pronunciation"]);
    for (const t of [1, 2, 3] as const) expect(RUBRIC.writing[t].map((c) => c.name)).toEqual(["Task completion", "Organization", "Vocabulary", "Grammar", "Spelling"]);
  });
  it("anchors sit in the /20 range of the level they are labelled with", () => {
    const range: Record<string, [number, number]> = { A1: [1, 3], A2: [4, 5], B1: [6, 10], B2: [10, 13], C1: [14, 15], C2: [16, 20] };
    for (const skill of ["writing", "speaking"] as const)
      for (const task of [1, 2, 3] as const)
        for (const a of ANCHORS[skill][task]) {
          const lv = /^(A1|A2|B1|B2|C1|C2)/.exec(a.level)?.[1];
          if (lv && !/plafond/i.test(a.verdict)) {
            expect(a.score20, `${skill} T${task} ${a.level}`).toBeGreaterThanOrEqual(range[lv][0]);
            expect(a.score20, `${skill} T${task} ${a.level}`).toBeLessThanOrEqual(range[lv][1]);
          }
        }
  });
});

describe("caps and whole scores", () => {
  const ok = { textTypeOk: true, registerOk: true, requiredElementsMissing: [] as string[] };
  it("rounds to the nearest whole score", () => {
    expect(applyCaps(10.8, ok, {}).score20).toBe(11);
    expect(applyCaps(8.4, ok, {}).score20).toBe(8);
  });
  it("caps: out-of-range length, missing element, off-task, empty, short speech", () => {
    expect(applyCaps(15, ok, { length: { wordCount: 100, min: 60, max: 120 } }).score20).toBe(15);
    expect(applyCaps(15, ok, { length: { wordCount: 130, min: 60, max: 120 } }).score20).toBe(11);
    expect(applyCaps(15, ok, { length: { wordCount: 40, min: 60, max: 120 } }).score20).toBe(8);
    const r = applyCaps(15, { ...ok, requiredElementsMissing: ["comparaison des deux documents"] }, {});
    expect(r.score20).toBe(11);
    expect(r.caps[0]).toContain("comparaison");
    expect(applyCaps(15, { ...ok, textTypeOk: false }, {}).score20).toBe(6);
    expect(applyCaps(15, ok, { empty: true }).score20).toBe(0);
    expect(applyCaps(9, ok, { length: { wordCount: 130, min: 60, max: 120 } }).caps).toEqual([]);
    expect(applyCaps(14, ok, { speechRatio: 0.3 }).score20).toBe(8);
  });
  it("status against the target of 10/20", () => {
    expect(targetStatus(9)).toBe("below");
    expect(targetStatus(10)).toBe("on");
    expect(targetStatus(11)).toBe("above");
  });
});

import { scoreInLevel } from "../../worker/sim/eval/rubric.ts";
describe("level first, number second", () => {
  it("keeps the number inside the level the scorer named", () => {
    expect(scoreInLevel("B2+", 15)).toBe(13);
    expect(scoreInLevel("A2", 8)).toBe(5);
    expect(scoreInLevel("C2-", 15)).toBe(16);
    expect(scoreInLevel("B1+", 9)).toBe(9);
    expect(scoreInLevel(undefined, 11)).toBe(11);
    expect(scoreInLevel("B2-", 0)).toBe(0);
  });
  it("writing: spelling counts in the score but not in the language ceiling", () => {
    const r = scoreFromCriteria("writing", 1, [{ name: "Task completion", score: 10 }, { name: "Vocabulary", score: 6 }, { name: "Grammar", score: 5 }, { name: "Spelling", score: 12 }]);
    expect(r.languageAverage).toBe(5.5);
    expect(r.criteria[0].score).toBe(8.5);
    expect(Math.round(r.score20)).toBe(6);
  });
});
