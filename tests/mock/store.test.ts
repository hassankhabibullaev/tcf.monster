// The browser's three copies of a mock's progress: how two copies merge (the newest stamp wins, the furthest cursor,
// the longest draft), and how a damaged copy is read.
import { describe, it, expect } from "vitest";
import { merge, sane, type LocalState } from "../../web/app/mock/store.ts";

const base = (): LocalState => sane(null, 7);

describe("merge", () => {
  it("the newest stamp wins per answer; an answer only one copy has is kept", () => {
    const a = base(), b = base();
    a.answers.co = { q1: "A", q2: "B" }; a.stamps.co = { q1: 100, q2: 100 };
    b.answers.co = { q1: "C", q3: "D" }; b.stamps.co = { q1: 200, q3: 50 };
    const m = merge(a, b);
    expect(m.answers.co).toEqual({ q1: "C", q2: "B", q3: "D" });
    expect(m.stamps.co).toEqual({ q1: 200, q2: 100, q3: 50 });
    // the other way round the same answers win
    expect(merge(b, a).answers.co).toEqual({ q1: "C", q2: "B", q3: "D" });
  });
  it("the cursor furthest along, the recording already heard, the longest draft", () => {
    const a = base(), b = base();
    a.cursor.co = 3; b.cursor.co = 5; b.cursor.ce = 1;
    a.heard.co = "q4"; b.heard.ce = "x";
    a.drafts = { "1": "Bonjour" }; b.drafts = { "1": "Bonjour madame", "2": "Salut" };
    const m = merge(a, b);
    expect(m.cursor).toEqual({ co: 5, ce: 1 });
    expect(m.heard).toEqual({ co: "q4", ce: "x" });
    expect(m.drafts).toEqual({ "1": "Bonjour madame", "2": "Salut" });
  });
  it("a damaged copy reads as empty fields, never as a crash", () => {
    const s = sane({ v: 1, id: 7 } as unknown as LocalState, 7);
    expect(s.answers).toEqual({ co: {}, ce: {} });
    expect(s.cursor).toEqual({ co: null, ce: null });
    expect(s.drafts).toEqual({});
  });
});
