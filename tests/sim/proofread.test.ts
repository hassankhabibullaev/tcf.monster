import { describe, expect, it } from "vitest";
import { flatten } from "../../worker/sim/eval/proofread.ts";

const TEXT = "J'ai decouvert le menu traditionel. Ensuite, nous pourrons dancer au menu traditionel.";

describe("complete proofreading", () => {
  it("keeps the mistakes of every sentence, in order, when they are in the text", () => {
    const out = flatten(TEXT, {
      sentences: [
        { sentence: "J'ai decouvert le menu traditionel.", mistakes: [{ excerpt: "decouvert", suggestion: "découvert", tip: "accent", kind: "spelling", sub: "accent" }, { excerpt: "traditionel", suggestion: "traditionnel", tip: "nn", kind: "spelling", sub: "orthographe" }] },
        { sentence: "Ensuite, nous pourrons dancer au menu traditionel.", mistakes: [{ excerpt: "dancer", suggestion: "danser", tip: "s", kind: "spelling", sub: "orthographe" }] },
      ],
    });
    expect(out.map((c) => c.excerpt)).toEqual(["decouvert", "traditionel", "dancer"]);
  });
  it("drops what is not in the text, what changes nothing, and an unknown sub-type", () => {
    const out = flatten(TEXT, {
      sentences: [{ sentence: "x", mistakes: [{ excerpt: "inventé", suggestion: "autre", tip: "", kind: "lexis" }, { excerpt: "menu", suggestion: "menu", tip: "", kind: "lexis" }, { excerpt: "dancer", suggestion: "danser", tip: "", kind: "spelling", sub: "sub" }] }],
    });
    expect(out).toHaveLength(1);
    expect(out[0].sub).toBeUndefined();
  });
  it("survives an empty or malformed answer", () => {
    expect(flatten(TEXT, null)).toEqual([]);
    expect(flatten(TEXT, { sentences: [{ sentence: "x" }] })).toEqual([]);
  });
});
