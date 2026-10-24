import { describe, it, expect } from "vitest";
import { CEFR_LEVELS, atB2Threshold, nativeStretch, stretched, accentOnly, boundedScore, buildTips, cefrOf, checkEvidence, errorCap, evidenceBounds, validFixes, wholeScore, type RawEvidence } from "../../worker/sim/eval/evidence.ts";
import { buildEvaluation, candidateText } from "../../worker/sim/eval/evaluate.ts";

const said = "Depuis trois ans, je travaille comme chef de projet. Je souhaite que tout se passe bien pour que je puisse m'installer au Canada. Si je pouvais, j'y retournerais dès demain. Le voyage qui m'a le plus marqué, c'est celui que j'ai fait l'année dernière. J'ai aimé ce voyage beaucoup.";
const raw = (o: Partial<RawEvidence>): RawEvidence => ({ complex: [], errors: [], precise: [], idioms: [], ...o });

describe("levels", () => {
  it("follow the official /20 table and cover the twenty points", () => {
    expect(CEFR_LEVELS.reduce((n, l) => n + l.span, 0)).toBe(20);
    expect([3, 4, 5, 6, 9, 10, 13, 14, 15, 16, 20].map((s) => cefrOf(s).id)).toEqual(["A1", "A2", "A2", "B1", "B1", "B2", "B2", "C1", "C1", "C2", "C2"]);
    expect(cefrOf(12).status).toBe("On target");
    expect(cefrOf(9).status).toBe("Almost there");
  });
});

describe("evidence is checked against what was really produced", () => {
  it("drops quotes that are not in the production, and counts distinct kinds of structure", () => {
    const e = checkEvidence(
      raw({
        complex: [
          { type: "subjonctif", quote: "pour que je puisse" },
          { type: "hypothese_conditionnel", quote: "Si je pouvais, j'y retournerais" },
          { type: "relative_complexe", quote: "celui que j'ai fait" },
          { type: "relative_simple", quote: "qui m'a le plus marqué" },
          { type: "gerondif", quote: "en voyageant beaucoup" }, // never said
          { type: "inconnu", quote: "je travaille" },
        ],
        errors: [
          { quote: "j'ai aimé ce voyage beaucoup", fix: "j'ai beaucoup aimé ce voyage", kind: "grammar", times: 1 },
          { quote: "une problème", fix: "un problème", kind: "grammar", times: 2 }, // never said
          { quote: "chef de projet", fix: "chef de projet", kind: "lexis", times: 1 }, // changes nothing
        ],
        precise: ["chef de projet", "m'installer", "cybersécurité"],
      }),
      said,
    );
    expect(e.complexTypes).toEqual(["subjonctif", "hypothese_conditionnel", "relative_complexe"]);
    expect(e.advanced).toBe(3);
    expect(e.grammarErrors).toBe(1);
    expect(e.lexisErrors).toBe(0);
    expect(e.precise).toBe(2);
    // in speech a one-off slip weighs half, a mistake that comes back weighs one
    const spoken = checkEvidence(raw({ errors: [{ quote: "j'ai aimé ce voyage beaucoup", fix: "j'ai beaucoup aimé ce voyage", kind: "grammar", times: 1 }, { quote: "je travaille comme chef", fix: "je travaille comme cheffe", kind: "grammar", times: 3 }] }), said, true);
    expect(spoken.grammarErrors).toBe(1.5);
  });
  it("reads the candidate's lines only", () => {
    expect(candidateText("speaking", "Examinatrice : Bonjour ?\nCandidat : Oui.\nExaminatrice : Merci.\nCandidat : Au revoir.")).toBe("Oui.\nAu revoir.");
    expect(candidateText("writing", "Bonjour Karim")).toBe("Bonjour Karim");
  });
});

describe("what the evidence allows", () => {
  const ev = (o: Partial<ReturnType<typeof checkEvidence>>) => ({ complexTypes: [], advanced: 0, grammarErrors: 0, lexisErrors: 0, spellingErrors: 0, precise: 0, idioms: 0, quotes: { complex: [], errors: [], precise: [], idioms: [] }, ...o });
  const W = 200;
  it("clean but simple production stops at the B2 threshold", () => {
    const b = evidenceBounds(ev({ complexTypes: ["mise_en_relief", "pronom_y_en"], precise: 7 }), W);
    expect(b.grammar[1]).toBe(10);
    expect(boundedScore(13, b.grammar, 0, W)).toBe(10);
    expect(b.vocabulary[1]).toBe(11);
  });
  it("advanced structures open the upper levels one by one, and idioms count too", () => {
    const types = ["subjonctif", "hypothese_conditionnel", "relative_complexe", "concession", "gerondif"];
    const hi = (n: number, idioms = 0) => evidenceBounds(ev({ complexTypes: types.slice(0, n), advanced: n, precise: 12, idioms }), W).grammar[1];
    expect([1, 2, 3, 4].map((n) => hi(n))).toEqual([11, 13, 14, 15]);
    expect(hi(5)).toBe(16);
    expect(hi(5, 3)).toBe(20);
    // near-native French with few « advanced structures » but many turns of phrase is not held at B2
    expect(hi(1, 8)).toBe(20);
    expect(evidenceBounds(ev({ complexTypes: types.slice(0, 4), advanced: 4, precise: 9 }), W).grammar[0]).toBe(13);
  });
  it("mistakes cost what real examiners make them cost: a B2 writer makes several per paragraph", () => {
    expect([0, 1, 2, 3, 5, 8, 12, 20, 30].map((n) => errorCap(n, 200))).toEqual([20, 18, 16, 16, 14, 12, 10, 8, 5]);
    const rich = { complexTypes: ["subjonctif", "concession", "gerondif", "relative_complexe"], advanced: 4, precise: 10 };
    expect(evidenceBounds(ev({ ...rich, grammarErrors: 2 }), W).grammar[1]).toBe(15);
    expect(evidenceBounds(ev({ ...rich, grammarErrors: 8 }), W).grammar[1]).toBe(12);
    // the examiner-validated B2 letter: about eleven mistakes in 270 words, one advanced structure → B2 threshold reachable
    const letter = evidenceBounds(ev({ complexTypes: ["hypothese_conditionnel", "mise_en_relief", "pronom_y_en"], advanced: 1, grammarErrors: 11, precise: 7 }), 270);
    expect(letter.grammar[1]).toBeGreaterThanOrEqual(11);
    expect(letter.grammar[0]).toBe(9);
    // simple language: a few slips leave it at the threshold, a mistake in every other sentence puts it in B1
    expect(evidenceBounds(ev({ grammarErrors: 1 }), W).grammar[1]).toBe(10);
    expect(evidenceBounds(ev({ grammarErrors: 5 }), W).grammar[1]).toBe(10);
    expect(evidenceBounds(ev({ grammarErrors: 9 }), W).grammar[1]).toBe(9);
    expect(evidenceBounds(ev({ grammarErrors: 11 }), 179).grammar[1]).toBe(9);
    expect(evidenceBounds(ev({ grammarErrors: 16 }), 179).grammar[1]).toBe(8);
    // a single mistake in a short text is not a pattern
    expect(evidenceBounds(ev({ grammarErrors: 1 }), 108).grammar[1]).toBe(10);
  });
  it("a production the scorer places at C1 or above is not pulled far down by a short list", () => {
    const b = evidenceBounds(ev({ complexTypes: ["relative_complexe"], advanced: 1, precise: 8, idioms: 1 }), W);
    expect(b.grammar[1]).toBe(11);
    expect(boundedScore(17, b.grammar, 0, W)).toBe(15);
    expect(boundedScore(14, b.grammar, 2, W)).toBe(12);
    // the mistakes still count: many of them, and the list wins
    expect(boundedScore(17, b.grammar, 12, W)).toBe(11);
    // and a B2 judgement stays where the list puts it
    expect(boundedScore(13, b.grammar, 0, W)).toBe(11);
  });
  it("vocabulary sits within two points of grammar; accents weigh half; spelling is not held under B2 by grammar", () => {
    const b = evidenceBounds(ev({ complexTypes: ["subjonctif"], advanced: 1, precise: 12, idioms: 1, grammarErrors: 20 }), W);
    expect(b.grammar[1]).toBe(8);
    expect(b.vocabulary[1]).toBe(b.grammar[1] + 2);
    const b2 = evidenceBounds(ev({ complexTypes: ["subjonctif", "concession"], advanced: 2, precise: 12, idioms: 3 }), W);
    expect(b2.vocabulary[1]).toBe(b2.grammar[1] + 1);
    expect(accentOnly("decouvrir", "découvrir")).toBe(true);
    expect(accentOnly("À bientot", "À bientôt")).toBe(true);
    expect(accentOnly("t'inscrir", "t'inscrire")).toBe(false);
    expect(evidenceBounds(ev({ spellingErrors: 1, complexTypes: ["subjonctif", "concession"], advanced: 2 }), 150).spelling[1]).toBe(16);
    expect(evidenceBounds(ev({ spellingErrors: 6 }), 85).spelling[1]).toBe(8);
    // many grammar mistakes, two counted spelling slips in 106 words: spelling may still reach 12
    expect(evidenceBounds(ev({ grammarErrors: 8, spellingErrors: 2 }), 106).spelling[1]).toBe(12);
  });
});

describe("one overall mark", () => {
  it("is the scorer's judgement, kept close to the criteria", () => {
    expect(wholeScore({ holistic: 14, criteriaMean: 12, audioMean: null })).toBe(12.6);
    expect(wholeScore({ holistic: 9, criteriaMean: 12, audioMean: null })).toBe(11.6);
    expect(wholeScore({ holistic: 12, criteriaMean: 12.2, audioMean: null })).toBe(12);
    expect(wholeScore({ holistic: undefined, criteriaMean: 11.3, audioMean: null })).toBe(11.3);
    // the recording moves the judgement by its share
    expect(wholeScore({ holistic: 12, criteriaMean: 11.5, audioMean: 9 })).toBe(11.1);
  });
  it("near-native productions are lifted past the scorer's 15 (counts recorded on real scorings, 2026-10-05)", () => {
    const e = (advanced: number, idioms: number, grammarErrors = 0, lexisErrors = 0) => ({ complexTypes: [], advanced, grammarErrors, lexisErrors, spellingErrors: 0, precise: 9, idioms, quotes: { complex: [], errors: [], precise: [], idioms: [] } });
    // the C2 message to a friend: rows 15 / 14 / 15 / 15, five idiomatic turns, no mistake → 17
    const lift = nativeStretch(e(4, 5), 113);
    expect([15, 14, 15, 15].map((x) => stretched(x, lift))).toEqual([18, 17, 18, 18]);
    expect(nativeStretch(e(2, 5), 113)).toBe(2);
    expect(nativeStretch(e(2, 8), 290)).toBe(3);
    // samples written for 14: one to four idiomatic turns → untouched
    for (const idioms of [1, 2, 3, 4]) expect(nativeStretch(e(5, idioms), 250)).toBe(0);
    // mistakes: one slip in a long text is fine, more is not native-like
    expect(nativeStretch(e(4, 6, 1), 290)).toBe(3);
    expect(nativeStretch(e(4, 6, 2), 290)).toBe(0);
    expect(nativeStretch(e(4, 6, 1), 100)).toBe(0);
    // and nothing below the C1 line is lifted, nothing goes past 19
    expect(stretched(13, 3)).toBe(13);
    expect(stretched(18, 3)).toBe(19);
  });
  it("what examiners call B2 is not marked below 10", () => {
    const e = (grammarErrors: number, lexisErrors = 0) => ({ complexTypes: [], advanced: 1, grammarErrors, lexisErrors, spellingErrors: 0, precise: 6, idioms: 0, quotes: { complex: [], errors: [], precise: [], idioms: [] } });
    // the examiner-validated B2 letter: task 12.5–13, twelve or thirteen mistakes in 271 words
    expect(atB2Threshold(13, e(12, 1), 271)).toBe(true);
    // the apartment message: task 12, three or four mistakes in 117 words
    expect(atB2Threshold(12, e(4, 1), 117)).toBe(true);
    // the B1 texts: task not developed enough, or a mistake in every other sentence
    expect(atB2Threshold(11.5, e(6, 2), 181)).toBe(false);
    expect(atB2Threshold(12, e(8), 106)).toBe(false);
    const base = { taskId: "t", skill: "writing" as const, task: 1 as const, fulfilment: { textTypeOk: true, registerOk: true, requiredElementsMissing: [] }, facts: { wordCount: 117, wordsMin: 60, wordsMax: 120 }, empty: false };
    const rows = [{ name: "Task completion", score: 12 }, { name: "Vocabulary", score: 9 }, { name: "Grammar", score: 9 }, { name: "Spelling", score: 8 }];
    // (LENIENCY adds 1.5 to every row and to the judgement before the rules run)
    expect(buildEvaluation(base, rows, { holistic: 9, evidence: e(4, 1) }).score20).toBe(10);
    expect(buildEvaluation(base, rows, { holistic: 9, evidence: e(9, 1) }).score20).toBe(9);
    // an off-task or too-short text is still capped afterwards
    expect(buildEvaluation({ ...base, fulfilment: { ...base.fulfilment, textTypeOk: false } }, rows, { holistic: 9, evidence: e(4, 1) }).score20).toBe(6);
  });
  it("gives a whole speaking mark with six rows, levels only on screen", () => {
    const base = { taskId: "t", skill: "speaking" as const, task: 1 as const, fulfilment: { textTypeOk: true, registerOk: true, requiredElementsMissing: [] }, facts: { speechRatio: 0.8 }, empty: false };
    const text = [{ name: "Task completion", score: 13 }, { name: "Organization", score: 12 }, { name: "Vocabulary", score: 13 }, { name: "Grammar", score: 12 }];
    const first = buildEvaluation(base, text, { holistic: 13 });
    expect(first.version).toBe(5);
    expect(first.stage).toBe("transcript");
    expect(first.locked).toEqual(["Fluency", "Pronunciation"]);
    expect(first.score20).toBe(13);
    const full = buildEvaluation(base, [...text, { name: "Fluency", score: 14 }, { name: "Pronunciation", score: 11 }], { holistic: 13 });
    expect(full.stage).toBe("full");
    expect(full.criteria).toHaveLength(6);
    expect(full.score20).toBe(13);
    expect(Number.isInteger(full.score20)).toBe(true);
  });
});

describe("tips", () => {
  it("keeps only corrections of what was really said, and at most three tips", () => {
    const fixes = validFixes(
      [
        { said: "« j'ai aimé ce voyage beaucoup »", say: "j'ai beaucoup aimé ce voyage.", label: "Word order", why: "Short adverbs go before the past participle." },
        { said: "je suis allé à Canada", say: "je suis allé au Canada", label: "Preposition", why: "au + masculine country" }, // never said
        { said: "chef de projet", say: "chef de projet", label: "x", why: "" },
      ],
      said,
    );
    expect(fixes).toEqual([{ said: "j'ai aimé ce voyage beaucoup", say: "j'ai beaucoup aimé ce voyage", label: "Word order", why: "Short adverbs go before the past participle." }]);
    const tips = buildTips({ fixes, sound: { word: "banques", heard: "bonques", tip: "open your mouth: an as in dans", answer: 0, atS: 12.4 }, next: { what: "Add one concession", example: "Même si mon travail est stressant, je l'adore." } });
    expect(tips.map((t) => t.kind)).toEqual(["fix", "sound", "next"]);
    expect(tips[1]).toMatchObject({ said: "bonques", say: "banques", answer: 0, atS: 12.4 });
    // nothing heard: no invented sound tip, and no tip at all when there is nothing to say
    expect(buildTips({ fixes: [], sound: null, next: null })).toEqual([]);
    expect(buildTips({ fixes: [], sound: { word: "", heard: "", tip: "" }, next: { what: "x", example: "Une phrase." } }).map((t) => t.kind)).toEqual(["next"]);
  });
});
