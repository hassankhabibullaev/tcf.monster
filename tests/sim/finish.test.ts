// The end of a speaking task on a pretend Gemini, marked as the browser marks it (shared/sim/oral-core.ts, with the
// person's own key): the clips kept on the device are transcribed whole and HEARD (fluency, pronunciation) without any
// WAV, so the evaluation reaches « full » from the clips alone. The server is not involved.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { makeEnv } from "../../scripts/local-env.ts";
import { setAiContext } from "../../shared/sim/ai/context.ts";
import { scoreSpeaking } from "../../shared/sim/oral-core.ts";
import { promptFromTopic, type TopicRow } from "../../worker/sim/prompts.ts";
import { boundsOfClips } from "../../worker/sim/eval/audio.ts";
import type { Turn } from "../../shared/sim/types.ts";

type Row = Record<string, any>;
let prompt: ReturnType<typeof promptFromTopic>;

/** every request Google received: its body, parsed */
let calls: Row[] = [];
const realFetch = globalThis.fetch;
const answer = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
const SCORE = { evidence: { complex: [], errors: [], precise: [], idioms: [] }, criteria: [{ name: "Task completion", reason: "ok", level: "B2-", score: 11 }, { name: "Organization", reason: "ok", level: "B2-", score: 11 }, { name: "Vocabulary", reason: "ok", level: "B2-", score: 10 }, { name: "Grammar", reason: "ok", level: "B2-", score: 10 }], fulfilment: { textTypeOk: true, registerOk: true, requiredElementsMissing: [] }, overall: { reason: "ok", level: "B2-", score: 10 }, fixes: [], next: { what: "Add a reason", example: "Je préfère le samedi parce que je travaille." } };
const HEARD = { aisance: { score: 9, reason: "hésitations" }, prononciation: { score: 12, reason: "clair" }, issues: [], sound: { word: "bonjour", heard: "bonchour", tip: "soft j as in déjà", at: "00:05" } };

beforeEach(() => {
  const { raw } = makeEnv();
  raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen) VALUES ('eo', 11, '2026-10', 1, 101, 2, 0, 'Je travaille à la piscine. Vous me posez des questions (horaires, prix, etc.).', '{}', 't', 't')").run();
  prompt = promptFromTopic("eo", 2, raw.prepare("SELECT * FROM topics WHERE id = 11").get() as unknown as TopicRow);
  setAiContext(() => ({ key: "AIza-test", userId: "u-test", lang: "fr" }));
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (!url.includes("generativelanguage.googleapis.com")) return realFetch(input, init);
    const body = JSON.parse(String(init?.body ?? "{}")) as Row;
    calls.push(body);
    const sys = String(body.systemInstruction?.parts?.[0]?.text ?? "");
    const user = String(body.contents?.[0]?.parts?.[0]?.text ?? "");
    if (sys.includes("spécialiste de phonétique")) return answer(JSON.stringify(HEARD));
    if (user.startsWith("Candidat au TCF Canada, tâche")) return answer("bonjour, je voudrais des informations sur les horaires");
    if (body.generationConfig?.responseJsonSchema?.properties?.fulfilment) return answer(JSON.stringify(SCORE));
    return answer("{}");
  }) as typeof fetch;
});
afterEach(() => { globalThis.fetch = realFetch; });

/** the turns as the speaking room keeps them on the device (web/app/sim/work.ts, applyLog) */
const said = (clipId: string, t: number, text?: string): Turn => ({ role: "candidate", text: text ?? "(inaudible)", t, clipId, durationS: 4, ...(text ? {} : { stitched: true }) });
const clip = (n: number) => new Blob([new Uint8Array(3000).fill(n)], { type: "audio/webm;codecs=opus" });
const mark = (stored: Turn[], clips: { clipId: string; audio: Blob; durationS: number }[], durationS = 20) => scoreSpeaking({ taskId: "t-1", taskNo: 2, prompt, stored, clips, durationS });

describe("marking a speaking task from the clips alone", () => {
  it("transcribes the deferred answers, hears every clip in order, and the mark is « full »", async () => {
    const r = await mark([said("c1", 6, "Bonjour, c'est bien la piscine ?"), said("c2", 26)], [{ clipId: "c2", audio: clip(2), durationS: 6 }, { clipId: "c1", audio: clip(1), durationS: 4 }]);

    // the deferred answer got its text from its clip; the other kept Google's live transcription
    expect(r.turns.filter((t) => t.role === "candidate").map((t) => t.text)).toEqual(["Bonjour, c'est bien la piscine ?", "bonjour, je voudrais des informations sur les horaires"]);
    expect(r.turns.some((t) => "stitched" in t)).toBe(false);
    // heard: both clips, in recording order, each with its own mime, no WAV anywhere
    const hearing = calls.find((c) => String(c.systemInstruction?.parts?.[0]?.text).includes("phonétique"))!;
    const parts = hearing.contents[0].parts as Row[];
    expect(parts.filter((p) => p.inlineData).map((p) => p.inlineData.mimeType)).toEqual(["audio/webm", "audio/webm"]);
    expect(parts.map((p) => p.text).filter(Boolean)).toContain("Prise de parole 1 :");
    expect(parts[0].text).toContain("Mesures indisponibles");
    expect(JSON.stringify(calls)).not.toContain("audio/wav");
    // the evaluation is complete: every criterion scored, the sound located in the second clip (00:05 → clip 2 at 1 s)
    const ev = r.evaluation!;
    expect(ev.stage).toBe("full");
    expect(ev.locked).toEqual([]);
    expect(ev.criteria.map((c) => c.name)).toEqual(["Task completion", "Organization", "Vocabulary", "Grammar", "Fluency", "Pronunciation"]);
    expect(ev.audio?.metrics).toBeNull();
    expect(ev.audio?.judgement.aisance.score).toBe(9);
    expect(ev.tips?.find((t) => t.kind === "sound")).toMatchObject({ answer: 1, atS: 1 });
    expect(ev.transcriptScore20).toBe(10);
  });
  it("a clip the log never registered is still transcribed and heard", async () => {
    // c2 was never registered (the tab closed before the log was written): it comes with the other clips
    const r = await mark([said("c1", 6, "Bonjour, c'est bien la piscine ?")], [{ clipId: "c1", audio: clip(1), durationS: 4 }, { clipId: "c2", audio: clip(2), durationS: 6 }]);
    expect(r.turns.filter((t) => t.role === "candidate").map((t) => [t.clipId, t.text])).toEqual([["c1", "Bonjour, c'est bien la piscine ?"], ["c2", "bonjour, je voudrais des informations sur les horaires"]]);
    const hearing = calls.find((c) => String(c.systemInstruction?.parts?.[0]?.text).includes("phonétique"))!;
    expect((hearing.contents[0].parts as Row[]).filter((p) => p.inlineData).length).toBe(2);
  });
  it("with no clip on the device, the kept texts are scored and the mark stays « transcript »", async () => {
    const r = await mark([said("c1", 6, "Bonjour, c'est combien ?")], [], 60);
    expect(r.evaluation!.stage).toBe("transcript");
    expect(r.evaluation!.locked).toEqual(["Fluency", "Pronunciation"]);
    expect(calls.some((c) => String(c.systemInstruction?.parts?.[0]?.text).includes("phonétique"))).toBe(false);
  });
  it("bounds follow from the durations", () => {
    expect(boundsOfClips([{ durationS: 4 }, { durationS: 6 }, { durationS: 2.5 }])).toEqual([{ start: 0, end: 4 }, { start: 4, end: 10 }, { start: 10, end: 12.5 }]);
  });
});
