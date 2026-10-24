// The listening (fluency, pronunciation) asks Google for JSON of a fixed shape; an answer that still cannot be read is
// asked once more instead of leaving the two criteria « waiting » (seen on 2026-10-22).
import { describe, it, expect, afterEach, vi } from "vitest";
import { setAiContext } from "../../shared/sim/ai/context.ts";
import { hearRecording } from "../../shared/sim/eval/audio.ts";

afterEach(() => { vi.unstubAllGlobals(); });
const answer = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });

describe("the listening", () => {
  it("asks for JSON, and asks once more when the first answer cannot be read", async () => {
    setAiContext(() => ({ key: "AIza-test", userId: "hear-user", lang: "fr" }));
    const bodies: Record<string, any>[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(JSON.parse(String(init.body)));
      return bodies.length === 1 ? answer("Le candidat parle assez bien, mais je ne peux pas noter.") : answer(JSON.stringify({ aisance: { score: 11, reason: "quelques pauses" }, prononciation: { score: 13, reason: "claire" }, issues: [] }));
    });
    const heard = await hearRecording({ taskNo: 1, transcript: "Je m'appelle Léa.", lang: "fr", clips: [{ data: new Uint8Array(2000).buffer, mime: "audio/webm", durationS: 4 }] });
    expect(bodies).toHaveLength(2);
    expect(bodies[0].generationConfig.responseMimeType).toBe("application/json");
    expect(bodies[0].generationConfig.responseJsonSchema.required).toEqual(["aisance", "prononciation"]);
    expect(heard.judgement.prononciation.score).toBe(13);
  });
});
