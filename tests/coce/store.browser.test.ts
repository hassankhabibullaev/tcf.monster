// The browser's progress store on a pretend browser (localStorage, fetch, document): two people on one browser never
// see or send each other's answers; a queue waits under its owner's key; the queue from before accounts were told
// apart is adopted by the browser's last person; nothing is queued before someone is signed in.
import { describe, it, expect, beforeEach, vi } from "vitest";

type Row = Record<string, any>;
const mem = new Map<string, string>();
const storage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => { mem.set(k, String(v)); },
  removeItem: (k: string) => { mem.delete(k); },
  key: (i: number) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
  clear: () => mem.clear(),
};
/** every bundle the server received, and what it answers */
let sent: Row[][] = [];
let answer: () => Response = () => new Response(JSON.stringify({ ok: true, applied: 1 }), { status: 200 });
const serverLevels = (levels: Row = {}) => new Response(JSON.stringify({ levels }), { status: 200 });
let progressFor: Record<string, Row> = {};
/** when set, the sync answer waits for it (a slow server) */
let gate: Promise<void> | null = null;

vi.stubGlobal("localStorage", storage);
vi.stubGlobal("sessionStorage", storage);
vi.stubGlobal("document", { addEventListener: () => {}, visibilityState: "visible" });
vi.stubGlobal("window", { addEventListener: () => {}, dispatchEvent: () => true });
vi.stubGlobal("navigator", { onLine: true });
vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
  if (String(url).startsWith("/api/sync")) { sent.push(JSON.parse(String(init?.body)).events); if (gate) await gate; return answer(); }
  if (String(url).startsWith("/api/progress")) { const section = String(url).split("section=")[1]; return serverLevels(progressFor[section] ?? {}); }
  throw new Error("unexpected " + url);
});

const store = await import("../../web/app/coce/store.ts");
const Q = { id: "q1", answer: "B" } as Parameters<typeof store.record.answer>[2];
const tick = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => { mem.clear(); sent = []; progressFor = {}; answer = () => new Response(JSON.stringify({ ok: true, applied: 1 }), { status: 200 }); store.setOwner(null); });

describe("one browser, two people", () => {
  it("nothing is queued before someone is signed in", async () => {
    store.record.answer("co", "A1", Q, "B");
    expect(store.pendingCount()).toBe(0);
    expect(mem.size).toBe(0);
  });

  it("A's unsent answers never go out as B's, and B never sees A's server copy", async () => {
    progressFor.co = { A1: { v: 1, q: { old: { s: "green", t: 1, a: "A" } }, pos: 3 } };
    store.setOwner("A");
    await store.load_("co"); await tick();
    expect(Object.keys(store.stateOf("co", "A1").q)).toEqual(["old"]);
    store.record.answer("co", "A1", Q, "B");
    expect(store.pendingCount()).toBe(1);
    expect(mem.has("tcfm-queue:A")).toBe(true);
    expect(store.stateOf("co", "A1").q.q1?.s).toBe("green");

    // B signs in on the same browser, before A's bundle went out
    progressFor.co = {};
    store.setOwner("B");
    expect(store.pendingCount()).toBe(0);
    await store.flush();
    expect(sent).toEqual([]); // A's answer did not go out under B
    await store.load_("co"); await tick();
    expect(store.stateOf("co", "A1").q).toEqual({}); // B sees nothing of A
    expect(mem.has("tcfm-queue:A")).toBe(true); // A's answer still waits for A

    // A comes back: the answer is there again and goes out
    progressFor.co = { A1: { v: 1, q: { old: { s: "green", t: 1, a: "A" } }, pos: 3 } };
    store.setOwner("A");
    expect(store.pendingCount()).toBe(1);
    await store.flush();
    expect(sent.length).toBe(1);
    expect(sent[0][0]).toMatchObject({ qid: "q1", key: "B", right: true, section: "co", level: "A1" });
    expect(mem.has("tcfm-queue:A")).toBe(false);
  });

  it("a bundle answered after the person changed is not folded into the newcomer's copy", async () => {
    store.setOwner("A");
    store.record.answer("co", "A1", Q, "B");
    let release: () => void = () => {};
    gate = new Promise<void>((r) => { release = r; });
    const p = store.flush();
    store.setOwner("B");
    release();
    await p;
    gate = null;
    expect(store.stateOf("co", "A1").q).toEqual({});
    expect(store.pendingCount()).toBe(0);
  });

  it("the queue from before accounts were told apart goes to the browser's last person, or the first one seen", async () => {
    mem.set("tcfm-queue", JSON.stringify([{ id: "e1", section: "ce", level: "B1", t: 1_800_000_000, type: "answer", qid: "x", key: "A", right: false }]));
    store.setOwner("A");
    expect(store.pendingCount()).toBe(1); // nobody known: adopted
    expect(mem.has("tcfm-queue")).toBe(false);
    expect(mem.get("tcfm-owner")).toBe("A");
    store.setOwner(null);
    mem.set("tcfm-queue", JSON.stringify([{ id: "e2", section: "ce", level: "B1", t: 1_800_000_001, type: "answer", qid: "y", key: "A", right: false }]));
    store.setOwner("B");
    expect(store.pendingCount()).toBe(0); // the last person here was A: not B's
    expect(mem.has("tcfm-queue")).toBe(false);
  });

  it("a hold or a lost network keeps the queue; sign-out keeps it too", async () => {
    store.setOwner("A");
    store.record.answer("co", "A1", Q, "B");
    answer = () => new Response(JSON.stringify({ hold: true }), { status: 200 });
    await store.flush();
    expect(store.pendingCount()).toBe(1);
    store.setOwner(null);
    expect(JSON.parse(mem.get("tcfm-queue:A")!).length).toBe(1);
  });

  it("forgetDevice removes drafts, marks and exam copies, never the queues", () => {
    mem.set("tcfm-draft-s1-1", "Bonjour"); mem.set("tcfm-progress-s1", "{}"); mem.set("tcfm-exam-9", "{}"); mem.set("tcfm-queue:A", "[]"); mem.set("tcfm-theme", "light");
    vi.stubGlobal("indexedDB", { deleteDatabase: () => {} });
    store.forgetDevice();
    expect([...mem.keys()].sort()).toEqual(["tcfm-queue:A", "tcfm-theme"]);
  });
});
