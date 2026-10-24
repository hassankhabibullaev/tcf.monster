// A person's Gemini key: its shape (the key itself stays in their browser).
import { describe, it, expect } from "vitest";
import { looksLikeKey } from "../../shared/sim/key-shape.ts";

describe("the Gemini key", () => {
  it("knows what a key looks like", () => {
    expect(looksLikeKey("AIzaSyD-example-key-0123456789abcdefghijk")).toBe(true);
    expect(looksLikeKey("AQ.Ab8RN6I-example-key-0123456789abcdef")).toBe(true);
    expect(looksLikeKey("AIza short")).toBe(false);
    expect(looksLikeKey("sk-proj-0123456789abcdefghijklmnopqrstuv")).toBe(false);
    expect(looksLikeKey("AIzaSyD example key 0123456789abcdefghijk")).toBe(false);
  });
});
