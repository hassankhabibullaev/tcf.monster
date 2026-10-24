import { describe, it, expect } from "vitest";
import { isRepeat } from "../../worker/sim/asked.ts";
import { T1_BANK_ALL, fallbackInterview } from "../../worker/sim/oral-bank.ts";

describe("cross-session question memory", () => {
  const asked = ["Que faites-vous dans la vie ?", "Quel voyage vous a le plus marqué ?", "Comment se passe une journée de travail pour vous ?"];
  it("detects exact repeats regardless of case, accents and punctuation", () => {
    expect(isRepeat("que faites-vous dans la vie", asked)).toBe(true);
    expect(isRepeat("Quel voyage vous a le plus marque ?", asked)).toBe(true);
  });
  it("detects reworded repeats", () => {
    expect(isRepeat("Quel est le voyage qui vous a le plus marqué ?", asked)).toBe(true);
    expect(isRepeat("Comment se passe votre journée de travail ?", asked)).toBe(true);
  });
  it("lets genuinely different questions through", () => {
    expect(isRepeat("Comment préparez-vous vos voyages ?", asked)).toBe(false);
    expect(isRepeat("Pouvez-vous me parler de votre meilleur ami ?", asked)).toBe(false);
    expect(isRepeat("Cuisinez-vous souvent à la maison ?", asked)).toBe(false);
  });
  it("the fallback interview avoids recently asked questions while the bank allows it", () => {
    const recent = T1_BANK_ALL.slice(0, 5);
    for (let i = 0; i < 20; i++) for (const q of fallbackInterview((x) => isRepeat(x, recent))) expect(recent).not.toContain(q);
  });
});
