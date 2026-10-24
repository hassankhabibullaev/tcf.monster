// Every transcript word can be pressed: the lines without their own timing share the time left around the timed ones.
import { describe, it, expect } from "vitest";
import { lineSpans, wordStart } from "../../web/app/coce/room/transcript-time.ts";

describe("where an untimed line sits in its recording", () => {
  it("keeps the known spans and shares the rest by length", () => {
    // speech timed 0.5–6, the question unknown (10 chars), two options unknown (10 and 20 chars), recording 46 s
    const s = lineSpans([{ chars: 40, span: [0.5, 6] }, { chars: 10, span: null }, { chars: 10, span: null }, { chars: 20, span: null }], 46);
    expect(s[0]).toEqual([0.5, 6]);
    expect(s[1]).toEqual([6, 16]);
    expect(s[2]).toEqual([16, 26]);
    expect(s[3]).toEqual([26, 46]);
  });
  it("fills a gap between two known lines, and starts at zero with nothing before", () => {
    const s = lineSpans([{ chars: 5, span: null }, { chars: 5, span: [10, 12] }, { chars: 1, span: null }, { chars: 1, span: [20, 22] }], 30);
    expect(s[0]).toEqual([0, 10]);
    expect(s[2]).toEqual([12, 20]);
  });
  it("with no length known yet, the unknown lines after the last known one stay at its end", () => {
    expect(lineSpans([{ chars: 4, span: [1, 3] }, { chars: 4, span: null }], 0)[1]).toEqual([3, 3]);
  });
  it("a word starts at its share of the line", () => {
    expect(wordStart([10, 20], 5, 10)).toBe(15);
    expect(wordStart([10, 20], 0, 10)).toBe(10);
    expect(wordStart([10, 20], 99, 10)).toBe(20);
  });
});
