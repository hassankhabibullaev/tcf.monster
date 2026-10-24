import { describe, it, expect } from "vitest";
import { explainChange, fluencyMetrics, parseAudioJudgement, type Word } from "../../worker/sim/eval/audio-core.ts";

/** words of 0.3 s separated by the given gaps, starting `lead` seconds into the answer */
const say = (start: number, lead: number, gaps: number[], texts?: string[]): Word[] => {
  let t = start + lead;
  return [0, ...gaps].map((g, i) => {
    t += g;
    const w = { word: texts?.[i] ?? `mot${i}`, start: t, end: t + 0.3 };
    t += 0.3;
    return w;
  });
};

describe("fluency measured from word timings", () => {
  it("counts pauses inside answers, not the silence between answers", () => {
    const a = say(0, 1.2, [0.1, 0.1, 0.9, 0.1, 2.0, 0.1]); // one pause ≥ 0.7 s, one ≥ 1.5 s
    const b = say(20, 0.8, [0.1, 0.1, 0.1, 0.1]);
    const m = fluencyMetrics([...a, ...b], [{ start: 0, end: 10 }, { start: 20, end: 30 }])!;
    expect(m.answers).toBe(2);
    expect(m.words).toBe(12);
    expect(m.pauses).toBe(2);
    expect(m.longPauses).toBe(1);
    expect(m.longestPauseS).toBe(2);
    expect(m.reactionS).toBe(1);
  });
  it("a halting speaker has a lower articulation rate and more pauses per minute than a fluent one", () => {
    const fluent = fluencyMetrics(say(0, 0.5, Array(40).fill(0.12)), [{ start: 0, end: 60 }])!;
    const halting = fluencyMetrics(say(0, 2.5, Array(40).fill(0).map((_, i) => (i % 4 === 0 ? 1.1 : 0.35))), [{ start: 0, end: 90 }])!;
    expect(fluent.articulationWpm).toBeGreaterThan(halting.articulationWpm);
    expect(fluent.pauses).toBe(0);
    expect(halting.pausesPerMinute).toBeGreaterThan(8);
  });
  it("counts fillers and immediate repetitions", () => {
    const m = fluencyMetrics(say(0, 0.5, [0.1, 0.1, 0.1, 0.1, 0.1], ["euh", "je", "je", "pense", "hum", "oui"]), [{ start: 0, end: 10 }])!;
    expect(m.fillers).toBe(2);
    expect(m.restarts).toBe(1);
  });
  it("returns null when there is nothing to measure", () => {
    expect(fluencyMetrics([], [{ start: 0, end: 5 }])).toBeNull();
  });
});

describe("audio judgement", () => {
  it("parses the model's JSON even with text around it, and clamps scores", () => {
    const j = parseAudioJudgement('Voici : {"aisance":{"score":8.4,"reason":"pauses"},"prononciation":{"score":25,"reason":"nasales"},"issues":["« demain »","",  "r"]} fin')!;
    expect(j.aisance.score).toBe(8);
    expect(j.prononciation.score).toBe(20);
    expect(j.issues).toEqual(["« demain »", "r"]);
    expect(parseAudioJudgement("désolée")).toBeNull();
    expect(parseAudioJudgement('{"aisance":{"score":"x"}}')).toBeNull();
  });
  it("explains the change of score", () => {
    const j = { aisance: { score: 7, reason: "a" }, prononciation: { score: 8, reason: "p" }, issues: ["hésitations en début de réponse"] };
    expect(explainChange(11, 9, j)).toContain("abaissée à 9");
    expect(explainChange(11, 9, j)).toContain("hésitations en début de réponse");
    expect(explainChange(10, 10, j)).toContain("confirmée");
    expect(explainChange(9, 10, j, "en")).toContain("raised to 10");
  });
});

import { boundFluency, fluencyBand, type FluencyMetrics } from "../../worker/sim/eval/audio-core.ts";

describe("fluency: the measures frame the score", () => {
  const m = (o: Partial<FluencyMetrics>): FluencyMetrics => ({ answers: 2, words: 250, articulationWpm: 120, pauses: 8, longPauses: 0, longestPauseS: 1, pausesPerMinute: 5, reactionS: 0.3, fillers: 0, restarts: 0, ...o });
  it("a fast, regular speaker with only short pauses is in the C1 range, and a model's « 12 » is lifted", () => {
    // the owner's session of 2026-10-05: 161 words/min, 3.8 pauses a minute, none long
    const fluent = m({ articulationWpm: 161, pausesPerMinute: 3.8, longPauses: 0, longestPauseS: 0.9 });
    expect(fluencyBand(fluent)).toEqual([14, 15]);
    expect(boundFluency(12, fluent)).toBe(13);
    expect(boundFluency(14, fluent)).toBe(14);
    expect(boundFluency(19, fluent)).toBe(16);
  });
  it("a slower or more hesitant speaker stays lower, whatever the model heard", () => {
    // session of 2026-09-20: 135 words/min, 8.4 pauses a minute, two long ones
    const hesitant = m({ articulationWpm: 135, pausesPerMinute: 8.4, longPauses: 2, longestPauseS: 1.9 });
    expect(fluencyBand(hesitant)).toEqual([8, 10]);
    expect(boundFluency(14, hesitant)).toBe(11);
    expect(fluencyBand(m({ articulationWpm: 130, pausesPerMinute: 5 }))).toEqual([12, 13]);
    expect(fluencyBand(m({ articulationWpm: 70, pausesPerMinute: 12 }))).toEqual([6, 8]);
  });
  it("says nothing when there is too little speech to measure", () => {
    expect(fluencyBand(null)).toBeNull();
    expect(fluencyBand(m({ words: 30 }))).toBeNull();
    expect(boundFluency(9, null)).toBe(9);
  });
});

import { locateWord } from "../../worker/sim/eval/audio-core.ts";
describe("the sound to fix", () => {
  it("is parsed with the judgement, and found in the recording for the replay button", () => {
    const j = parseAudioJudgement('{"aisance":{"score":12,"reason":""},"prononciation":{"score":11,"reason":""},"issues":[],"sound":{"word":"banques","heard":"bonques","tip":"open your mouth"}}')!;
    expect(j.sound).toEqual({ word: "banques", heard: "bonques", tip: "open your mouth" });
    expect(parseAudioJudgement('{"aisance":{"score":12,"reason":""},"prononciation":{"score":11,"reason":""},"issues":[],"sound":{"word":"","heard":"","tip":""}}')!.sound).toBeNull();
    const words = [{ word: "les", start: 21.0, end: 21.2 }, { word: "Banques,", start: 21.3, end: 21.8 }];
    expect(locateWord(words, [{ start: 0, end: 10 }, { start: 20, end: 30 }], "banques")).toEqual({ answer: 1, atS: 1.3 });
    expect(locateWord(words, [{ start: 0, end: 10 }], "banques")).toBeNull();
    expect(locateWord(words, [{ start: 20, end: 30 }], "cyberattaques")).toBeNull();
  });
});

import { checkedJudgement, isFalseAlarm } from "../../worker/sim/eval/audio-core.ts";
describe("faults the listening model invents", () => {
  it("knows that silent endings are silent", () => {
    expect(isFalseAlarm("projet", "proje")).toBe(true);
    expect(isFalseAlarm("immigrer", "imigré")).toBe(true);
    expect(isFalseAlarm("beaucoup", "bocou")).toBe(false); // spelled too differently to decide: left alone
    expect(isFalseAlarm("banques", "bonques")).toBe(false);
    expect(isFalseAlarm("demain", "demène")).toBe(false);
  });
  it("drops them, with the tip built on them, and does not leave the score below 12 for nothing", () => {
    // the owner's session of 2026-10-05
    const j = checkedJudgement({ aisance: { score: 11, reason: "" }, prononciation: { score: 10, reason: "x" }, issues: ['"projet" prononcé "proje" : voyelle finale', '"transportation" prononcé "transportation" : mot calqué, rythme', '"immigrer" prononcé "imigré" : r final affaibli'], sound: { word: "projet", heard: "proje", tip: "close lips" } });
    expect(j.issues).toEqual([]);
    expect(j.sound).toBeNull();
    expect(j.prononciation.score).toBe(12);
    // real faults stay, and so does the score
    const real = checkedJudgement({ aisance: { score: 9, reason: "" }, prononciation: { score: 9, reason: "nasales" }, issues: ["« banques » prononcé « bonques » : voyelle nasale", "« demain » prononcé « demène »"], sound: { word: "banques", heard: "bonques", tip: "open" } });
    expect(real.issues).toHaveLength(2);
    expect(real.sound?.word).toBe("banques");
    expect(real.prononciation.score).toBe(9);
  });
});

describe("measures taken on the recording itself", () => {
  it("counts the pauses between voiced stretches and reads the moment of a sound", async () => {
    const { energyMetrics, parseClock, locateAt } = await import("../../worker/sim/eval/audio-core.ts");
    const rate = 16000;
    const s = (sec: number) => Math.round(sec * rate);
    // 10 s: 1 s silence, 3 s voice, 1 s pause, 2 s voice, 0.5 s pause, 2.5 s voice
    const pcm = new Int16Array(s(10));
    const voice = (from: number, to: number) => {
      for (let i = s(from); i < s(to); i++) pcm[i] = Math.round(6000 * Math.sin(i / 7));
    };
    voice(1, 4);
    voice(5, 7);
    voice(7.5, 10);
    const m = energyMetrics(pcm, rate, [{ start: 0, end: 10 }], "je pense que euh c'est très très bien pour moi et ma famille");
    expect(m).not.toBeNull();
    expect(m!.pauses).toBe(1);
    expect(m!.longPauses).toBe(0);
    expect(m!.longestPauseS).toBeCloseTo(1, 0);
    expect(m!.reactionS).toBeCloseTo(1, 0);
    expect(m!.fillers).toBe(1);
    expect(m!.restarts).toBe(1);
    expect(parseClock("01:23")).toBe(83);
    expect(parseClock("1:23.5")).toBe(83.5);
    expect(parseClock("12")).toBe(12);
    expect(parseClock("nope")).toBeNull();
    expect(locateAt([{ start: 0, end: 30 }, { start: 30.6, end: 60 }], 45.2)).toEqual({ answer: 1, atS: 14.6 });
  });
});
