import { describe, it, expect } from "vitest";
import { wordCount } from "../../worker/sim/util.ts";

describe("wordCount", () => {
  it("counts words separated by whitespace and ignores punctuation-only tokens", () => {
    expect(wordCount("Bonjour, je m'appelle Hassan.")).toBe(4);
    expect(wordCount("  — ...  ")).toBe(0);
    expect(wordCount("")).toBe(0);
  });
  it("counts hyphenated and apostrophe words as single tokens", () => {
    expect(wordCount("C'est un rendez-vous à 10 h")).toBe(6);
  });
});
