// The practice search (docs/COCE.md §5): accents and case ignored, every field tried, twenty hits at most, a snippet
// around the match.
import { describe, it, expect } from "vitest";
import { fold, searchQuestions, snippetOf } from "../../web/app/coce/pages/search.ts";
import type { Question } from "../../web/app/coce/bank.ts";
import { LEVELS } from "../../shared/progress.ts";

const q = (id: string, over: Partial<Question>): Question => ({
  id, section: "co", level: "A1", stem: "Que dit-elle ?", stemEn: null,
  options: [{ key: "A", text: null, textEn: null, reason: null }, { key: "B", text: null, textEn: null, reason: null }, { key: "C", text: null, textEn: null, reason: null }, { key: "D", text: null, textEn: null, reason: null }],
  answer: "A", hint: null, keySentence: null, keySentenceEn: null, explanation: null, audio: null, image: null, transcript: null, transcriptEn: null, words: null, segments: null, maxPlays: 2, passage: null, passageEn: null, passageImage: null, practiceOnly: false, ...over,
});

describe("the practice search", () => {
  it("folds accents and case", () => {
    expect(fold("Élève à l'école")).toBe("eleve a l'ecole");
  });
  it("finds a word in the stem, an option, the transcript or the passage, once per question, with its level and number", () => {
    const bank = {
      A1: [q("a", { stem: "Où va-t-il ?" }), q("b", { transcript: "Je prends le MÉTRO ce matin." })],
      B2: [q("c", { options: [{ key: "A", text: "Le métro", textEn: null, reason: null }], passage: "Le metro est fermé." }), q("d", { passage: "Rien ici." })],
    };
    const hits = searchQuestions(bank, LEVELS, "métro");
    expect(hits.map((h) => `${h.level}-${h.n}`)).toEqual(["A1-2", "B2-1"]);
    expect(hits[0].snippet).toBe("Je prends le MÉTRO ce matin.");
    expect(hits[1].snippet).toBe("Le métro"); // the option was tried before the passage
  });
  it("needs two characters and stops at twenty hits", () => {
    const bank = { A1: Array.from({ length: 30 }, (_, i) => q(String(i), { stem: "Bonjour tout le monde" })) };
    expect(searchQuestions(bank, LEVELS, "b")).toEqual([]);
    expect(searchQuestions(bank, LEVELS, "  ")).toEqual([]);
    expect(searchQuestions(bank, LEVELS, "bonjour")).toHaveLength(20);
  });
  it("cuts a snippet around the match", () => {
    const text = `${"a".repeat(50)} cible ${"b".repeat(100)}`;
    const s = snippetOf(text, 51, 5);
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
    expect(s).toContain("cible");
    expect(s.length).toBeLessThan(110);
  });
});
