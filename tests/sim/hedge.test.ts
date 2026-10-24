// A model that hangs is not waited for: the next one starts after a few seconds, and once one answers, the request
// still running on the other is dropped (it would only use the person's free quota, and a phone's connection).
import { describe, it, expect, afterEach, vi } from "vitest";
import { setAiContext } from "../../shared/sim/ai/context.ts";
import { chat } from "../../shared/sim/ai/gemini.ts";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("hedged Gemini calls", () => {
  it("the first answer wins and the request still running is cancelled, without setting its model aside", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    setAiContext(() => ({ key: "AIza-test", userId: "hedge-user", lang: "en" }));
    const seen: { model: string; signal: AbortSignal }[] = [];
    vi.stubGlobal("fetch", (url: string, init: RequestInit) => {
      const model = /models\/([^:]+):/.exec(url)![1];
      seen.push({ model, signal: init.signal! });
      if (seen.length === 1) {
        // the first model hangs until it is dropped
        return new Promise((_, no) => init.signal!.addEventListener("abort", () => no(Object.assign(new Error("aborted"), { name: "AbortError" }))));
      }
      return Promise.resolve(new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "{\"ok\":true}" }] } }] }), { status: 200 }));
    });
    const p = chat<{ ok: boolean }>({ feature: "test", tier: "cheap", messages: [{ role: "user", content: "hi" }], jsonSchema: { name: "x", schema: { type: "object" } } });
    await vi.advanceTimersByTimeAsync(7_100);
    const r = await p;
    expect(r.json).toEqual({ ok: true });
    expect(seen).toHaveLength(2);
    expect(seen[0].signal.aborted).toBe(true); // the hanging request was dropped once the second answered
    // a dropped request is not a slow model: the next call starts with it again
    const before = seen.length;
    const q = chat({ feature: "test", tier: "cheap", messages: [{ role: "user", content: "again" }] });
    await vi.advanceTimersByTimeAsync(10);
    expect(seen[before].model).toBe(seen[0].model);
    await vi.advanceTimersByTimeAsync(7_100);
    await q.catch(() => null);
  });
});
