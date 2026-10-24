import { describe, it, expect } from "vitest";
import { correctedText, segmentsOf, validCorrections, type Correction } from "../../worker/sim/eval/highlight.ts";

const c = (excerpt: string, suggestion: string): Correction => ({ excerpt, suggestion, tip: "t", kind: "grammar" });

describe("corrections anchored in the candidate's own words", () => {
  const text = "Je suis déménagé à Sherbrooke. Il y a beaucoup des cartons, beaucoup des cartons.";
  it("highlights each excerpt once, case-insensitively, keeping the rest", () => {
    const segs = segmentsOf(text, [c("je suis déménagé", "J'ai déménagé"), c("beaucoup des cartons", "beaucoup de cartons")]);
    expect(segs.map((s) => s.text).join("")).toBe(text);
    expect(segs.filter((s) => s.corr).map((s) => s.text)).toEqual(["Je suis déménagé", "beaucoup des cartons"]);
  });
  it("builds the corrected version by changing only those words", () => {
    expect(correctedText(text, [c("Je suis déménagé", "J'ai déménagé"), c("beaucoup des cartons", "beaucoup de cartons")])).toBe("J'ai déménagé à Sherbrooke. Il y a beaucoup de cartons, beaucoup des cartons.");
  });
  it("drops corrections that are not in the text, change nothing, or repeat", () => {
    const v = validCorrections(text, [c("« Je suis déménagé »", "J'ai déménagé"), c("absent du texte", "x"), c("à Sherbrooke", "à Sherbrooke"), c("je suis déménagé", "J'ai déménagé")], 10);
    expect(v.map((x) => x.excerpt)).toEqual(["Je suis déménagé"]);
  });
  it("does not overlap", () => {
    expect(segmentsOf("il est bien bien", [c("il est bien", "a"), c("est bien", "b")]).filter((s) => s.corr)).toHaveLength(1);
  });
});

import { copiedPassages } from "../../worker/sim/eval/highlight.ts";
describe("writing T3: copied passages", () => {
  const doc = "Dans les grandes villes, on voit de plus en plus de peintures et de dessins sur les façades des bâtiments publics et privés. Cet art de rue permet à la culture d'être présente dans l'espace public.";
  it("finds runs of six words or more taken from a document, and ignores a reformulation", () => {
    const copied = copiedPassages("Le premier texte dit que cet art de rue permet à la culture d'être présente dans l'espace public, ce qui est vrai.", [doc]);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toContain("cet art de rue permet à la culture");
    expect(copiedPassages("Selon le premier document, les graffitis rendent la culture visible dans la rue pour tous les habitants.", [doc])).toEqual([]);
  });
  it("short common sequences do not count", () => {
    expect(copiedPassages("On voit de plus en plus de touristes.", [doc])).toEqual([]);
  });
});
