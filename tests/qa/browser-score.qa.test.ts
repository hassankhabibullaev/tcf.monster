// The marking that runs in the person's browser (web/app/sim/browser-score.ts), end to end: the browser's own module
// calls a pretend Google with the person's key (kept on the device only) and keeps the text, the turns and the
// corrections on the device (work.ts, on an in-memory IndexedDB); the real Worker gets the marks alone and never
// calls Google.
import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import worker from "../../worker/index.ts";
import { setup, teardown, type QA, type Row } from "./helpers.ts";

const CLIPS: { clipId: string; blob: Blob; durationS: number }[] = [];
vi.mock("../../web/app/sim/clips", () => ({ UPLOAD_BUDGET: 20_000_000, clipsOf: async () => CLIPS, getClip: async () => null }));
const score = await import("../../web/app/sim/browser-score.ts");
const work = await import("../../web/app/sim/work.ts");

let qa: QA, cookie: string;
const KEY = "AIza" + "k".repeat(35);
const answer = (text: string) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200, headers: { "content-type": "application/json" } });
const SCORE = { evidence: { complex: [], errors: [], precise: [], idioms: [] }, criteria: [{ name: "Task completion", reason: "ok", level: "B2-", score: 11 }, { name: "Organization", reason: "ok", level: "B2-", score: 11 }, { name: "Vocabulary", reason: "ok", level: "B2-", score: 10 }, { name: "Grammar", reason: "ok", level: "B2-", score: 10 }], fulfilment: { textTypeOk: true, registerOk: true, requiredElementsMissing: [] }, overall: { reason: "ok", level: "B2-", score: 10 }, fixes: [], next: { what: "Add a reason", example: "Je préfère le samedi parce que je travaille." } };
const HEARD = { aisance: { score: 9, reason: "hésitations" }, prononciation: { score: 12, reason: "clair" }, issues: [], sound: { word: "bonjour", heard: "bonchour", tip: "soft j", at: "00:05" } };
let googleCalls: { key: string | null; body: Row }[] = [];
let serverGoogle = 0;

beforeEach(async () => {
  qa = setup();
  cookie = await qa.signUp("a@b.com");
  qa.raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen) VALUES ('ee', 1, '2026-10', 1, 10, NULL, 0, 'Combinaison 1', '{\"tache1\":\"Écrivez à votre ami.\",\"tache2\":\"Racontez.\",\"tache3\":{\"title\":\"Pour ou contre ?\",\"document1\":\"D1\",\"document2\":\"D2\"}}', 't', 't')").run();
  qa.raw.prepare("INSERT INTO topics (section, id, month, part, part_id, tache, position, title, body, first_seen, last_seen) VALUES ('eo', 2, '2026-10', 1, 11, 2, 0, 'Je travaille à la piscine.', '{}', 't', 't')").run();
  const me = (await qa.call("/api/me", { cookie })).data;
  googleCalls = []; serverGoogle = 0; CLIPS.length = 0;
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) });
  const before = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    // the browser's own requests to our Worker, signed in
    if (url.startsWith("/api/")) {
      const headers = new Headers(init?.headers);
      headers.set("cookie", cookie);
      if (init?.method && init.method !== "GET") headers.set("origin", "https://tcf.monster");
      return worker.fetch(new Request(`https://tcf.monster${url}`, { ...init, headers }), qa.env);
    }
    if (url.includes("/models?")) { googleCalls.push({ key: new Headers(init?.headers).get("x-goog-api-key"), body: {} }); return new Response(JSON.stringify({ models: [{ name: "models/gemini-2.5-flash" }] }), { status: 200 }); }
    if (url.includes("generativelanguage.googleapis.com")) {
      const headers = new Headers(init?.headers);
      const body = JSON.parse(String(init?.body ?? "{}")) as Row;
      googleCalls.push({ key: headers.get("x-goog-api-key"), body });
      const sys = String(body.systemInstruction?.parts?.[0]?.text ?? "");
      const user = String(body.contents?.[0]?.parts?.[0]?.text ?? "");
      if (sys.includes("spécialiste de phonétique")) return answer(JSON.stringify(HEARD));
      if (user.startsWith("Candidat au TCF Canada, tâche")) return answer("bonjour, je voudrais des informations");
      if (body.generationConfig?.responseJsonSchema?.properties?.fulfilment) return answer(JSON.stringify(SCORE));
      return answer(JSON.stringify({ corrections: [] }));
    }
    return before(input, init);
  });
  score.setScoringPerson(me.id, "en");
  work.setWorkOwner(me.id);
  // the key is pasted on this device: checked with Google from here, kept here
  expect(await score.saveKeyHere(` ${KEY} `)).toEqual({ ok: true });
  // the Worker hears how it went (never the key) and never calls Google itself
  qa.google.handler = () => { serverGoogle++; return new Response("{}", { status: 500 }); };
});

/** everything the database holds, as one string */
const everything = () => JSON.stringify(["users", "expr_sessions", "expr_tasks", "user_kv"].map((t) => qa.raw.prepare(`SELECT * FROM ${t}`).all()));
afterEach(() => { teardown(); vi.unstubAllGlobals(); });

const start = async (body: unknown) => {
  const r = await qa.call("/api/expr/start", { body, cookie });
  qa.raw.prepare("UPDATE expr_sessions SET started_at = ? WHERE id = ?").run(new Date(Date.now() - 120_000).toISOString(), r.data.sessionId);
  return r.data.sessionId as string;
};

describe("the key", () => {
  it("is checked with Google from here and kept here; the account learns its status only", async () => {
    expect(googleCalls).toEqual([{ key: KEY, body: {} }]);
    expect(score.keyHere()).toBe(KEY);
    expect(score.keyStatusHere()).toBe("ok");
    await new Promise((r) => setTimeout(r, 10));
    expect(qa.raw.prepare("SELECT gemini_status s FROM users").get()).toEqual({ s: "ok" });
    expect(everything()).not.toContain(KEY);
    expect(await score.saveKeyHere("sk-" + "x".repeat(40))).toEqual({ ok: false, error: "shape" });
    score.forgetKeyHere();
    expect(score.keyHere()).toBeNull();
    expect(score.keyStatusHere()).toBe("none");
  });
  it("an older copy kept with the account's tag is still read", () => {
    localStorage.setItem(`tcfm-gk:${(qa.raw.prepare("SELECT id FROM users").get() as Row).id}`, JSON.stringify({ k: KEY, t: "abc" }));
    expect(score.keyHere()).toBe(KEY);
  });
});

describe("marking in the browser", () => {
  it("writing: Google is called from here with the device's key; the Worker stores the marks; the text stays here", async () => {
    const sid = await start({ section: "ee", kind: "practice", taches: [1] });
    const text = "Salut Paul, je t'écris pour te raconter mon week-end à la mer avec ma famille.";
    const r = await score.markWriting(sid, 1, text, 400);
    expect(r.score20).toBeGreaterThan(0);
    expect(googleCalls.length).toBeGreaterThan(1);
    expect(googleCalls.every((c) => c.key === KEY)).toBe(true);
    const t = qa.raw.prepare("SELECT status, score20, level, word_count, marks_json FROM expr_tasks WHERE session_id = ?").get(sid) as Row;
    expect(t).toMatchObject({ status: "done", score20: r.score20, level: r.level });
    expect(t.word_count).toBeGreaterThan(10);
    const marks = JSON.parse(t.marks_json);
    expect(marks.criteria.map((c: Row) => c.name)).toEqual(expect.arrayContaining(["Task completion", "Organization", "Vocabulary", "Grammar"]));
    expect(marks.criteria.every((c: Row) => Object.keys(c).join() === "name,score")).toBe(true);
    expect(everything()).not.toMatch(/Paul|week-end|famille|Add a reason/);
    // on this device: the text and the whole evaluation
    const kept = await work.getWork(sid, 1);
    expect(kept?.text).toBe(text);
    expect(JSON.parse(kept!.evaluation!).score20).toBe(r.score20);
    const view = await work.loadSession(sid);
    expect(view.tasks[0]).toMatchObject({ responseText: text, elsewhere: false });
    // marked again (a room reopened): the stored mark comes back, nothing is asked of Google
    const n = googleCalls.length;
    expect((await score.markWriting(sid, 1, "autre", 1)).score20).toBe(r.score20);
    expect(googleCalls.length).toBe(n);
    // another device (nothing kept there): the marks alone
    work.setWorkOwner("someone-else");
    const there = await work.loadSession(sid).catch(() => null);
    work.setWorkOwner((qa.raw.prepare("SELECT id FROM users").get() as Row).id);
    expect(there?.tasks[0]).toMatchObject({ responseText: null, elsewhere: true });
    expect(JSON.parse(there!.tasks[0].feedbackJson!).criteria).toEqual(marks.criteria);
    expect(serverGoogle).toBe(0);
  });

  it("speaking: the turns are kept here as the room logs them, the clips go from here to Google, the marks alone reach the Worker", async () => {
    const sid = await start({ section: "eo", kind: "practice", taches: [2], mode: "live", topicIds: { 2: 2 } });
    await work.applyLog(sid, [{ taskNo: 2, clipId: "c1", register: true, durationS: 4, elapsedS: 10 }, { taskNo: 2, clipId: "c1", candidateText: "Bonjour, c'est bien la piscine ?" }, { taskNo: 2, examinerText: "Oui, bonjour.", elapsedS: 12 }]);
    // a log written twice (the tab hid while it was being written): the answer is kept once
    await work.applyLog(sid, [{ taskNo: 2, clipId: "c1", register: true, durationS: 4, elapsedS: 10 }]);
    expect((await work.getWork(sid, 2))?.turns?.map((u) => [u.role, u.text])).toEqual([["candidate", "Bonjour, c'est bien la piscine ?"], ["examiner", "Oui, bonjour."]]);
    CLIPS.push({ clipId: "c1", blob: new Blob([new Uint8Array(3000).fill(1)], { type: "audio/webm" }), durationS: 4 });
    const r = await score.markSpeaking(sid, 2, 60);
    expect(r.score20).toBeGreaterThan(0);
    expect(googleCalls.some((c) => String(c.body.systemInstruction?.parts?.[0]?.text).includes("phonétique"))).toBe(true);
    const t = qa.raw.prepare("SELECT status, score20, marks_json FROM expr_tasks WHERE session_id = ?").get(sid) as Row;
    expect(t.status).toBe("done");
    expect(JSON.parse(t.marks_json).score20).toBe(r.score20);
    expect(everything()).not.toMatch(/piscine \?|Oui, bonjour/);
    expect(JSON.parse((await work.getWork(sid, 2))!.evaluation!).stage).toBe("full");
    expect(serverGoogle).toBe(0);
  });

  it("the mistake list and a rewrite: made and kept here", async () => {
    const sid = await start({ section: "ee", kind: "practice", taches: [1] });
    await score.markWriting(sid, 1, "Salut Paul, je t'écris pour te raconter mon week-end.", 400);
    const d = await score.markDetail(sid, 1);
    expect(d.version).toBe(2);
    expect(JSON.parse((await work.getWork(sid, 1))!.detail!).version).toBe(2);
    const rev = await score.markRevision(sid, 1, "Salut Paul, je t'écris pour te raconter mon beau week-end.");
    expect(rev.revisions).toHaveLength(1);
    expect(JSON.parse((await work.getWork(sid, 1))!.versions!)).toHaveLength(1);
    await expect(score.markRevision(sid, 1, "Salut Paul, je t'écris pour te raconter mon beau week-end.")).rejects.toThrow(/n'a pas changé/);
    expect(everything()).not.toMatch(/beau week-end/);
    // the session deleted from the history: its work goes from this device too
    await work.dropSessionWork(sid);
    expect(await work.getWork(sid, 1)).toBeNull();
  });

  it("no key on this device: the error says so (the room opens the key sheet), and nothing is stored", async () => {
    score.forgetKeyHere();
    const sid = await start({ section: "ee", kind: "practice", taches: [1] });
    await expect(score.markWriting(sid, 1, "Salut Paul.", 10)).rejects.toMatchObject({ code: "no_key" });
    expect((qa.raw.prepare("SELECT status s FROM expr_tasks WHERE session_id = ?").get(sid) as Row).s).toBe("pending");
  });
});
