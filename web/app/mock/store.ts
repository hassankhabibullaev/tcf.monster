// Progress that cannot be lost (docs/MOCK-EXAM.md §3.1): the running stage's answers, the current question, the
// recording already heard and the writing drafts live in three places at once — this object's memory, localStorage
// (`tcfm-mock-<id>`) and IndexedDB (`tcfm-mock` · `state`) — and reach the server only when they must (the free plan
// counts every request; choosing an option sends nothing): at the stage's end, keepalive when the tab hides or the
// page is left, one try every 10 s after a failure, for ever. Every answer carries a stamp;
// when the three copies and the server's disagree, the newest stamp wins and what the server lacks goes out at once.
// Nothing here ever asks the person to retry.
import { serverNow } from "../coce/room/hooks.ts";
import { patchMock, type Answer } from "./api.ts";

export type CoceStage = "co" | "ce";
export type LocalState = {
  v: 1; id: number;
  answers: Record<CoceStage, Record<string, Answer>>;
  /** the stamp (server clock, ms) of every answer, so two copies can be merged */
  stamps: Record<CoceStage, Record<string, number>>;
  /** the question the person was on (index), per stage */
  cursor: Record<CoceStage, number | null>;
  /** the question whose recording has already been heard (the strict CO stage never plays it twice) */
  heard: Record<CoceStage, string | null>;
  /** the writing drafts, by task */
  drafts: Record<string, string>;
};

const RETRY_MS = 10_000;
const DB = "tcfm-mock";
const STORE = "state";
const lsKey = (id: number) => `tcfm-mock-${id}`;
const empty = (id: number): LocalState => ({ v: 1, id, answers: { co: {}, ce: {} }, stamps: { co: {}, ce: {} }, cursor: { co: null, ce: null }, heard: { co: null, ce: null }, drafts: {} });

function idb<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction(STORE, mode);
          const r = f(tx.objectStore(STORE));
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => resolve(null);
          tx.oncomplete = () => db.close();
          tx.onerror = () => db.close();
        } catch { resolve(null); }
      };
    } catch { resolve(null); }
  });
}

const readLocal = (id: number): LocalState | null => { try { const v = JSON.parse(localStorage.getItem(lsKey(id)) ?? "null"); return v && v.v === 1 && v.id === id ? (v as LocalState) : null; } catch { return null; } };
export const sane = (s: LocalState | null, id: number): LocalState => ({ ...empty(id), ...(s ?? {}), answers: { co: s?.answers?.co ?? {}, ce: s?.answers?.ce ?? {} }, stamps: { co: s?.stamps?.co ?? {}, ce: s?.stamps?.ce ?? {} }, cursor: { co: s?.cursor?.co ?? null, ce: s?.cursor?.ce ?? null }, heard: { co: s?.heard?.co ?? null, ce: s?.heard?.ce ?? null }, drafts: s?.drafts ?? {} });

/** the two local copies merged answer by answer (the newest stamp wins), the furthest cursor, the longest draft */
export function merge(a: LocalState, b: LocalState): LocalState {
  const out = sane(a, a.id);
  for (const st of ["co", "ce"] as const) {
    for (const [k, v] of Object.entries(b.answers[st])) {
      const tb = b.stamps[st][k] ?? 0, ta = out.stamps[st][k] ?? 0;
      if (!(k in out.answers[st]) || tb > ta) { out.answers[st][k] = v; out.stamps[st][k] = tb; }
    }
    if (out.cursor[st] == null || (b.cursor[st] != null && (b.cursor[st] as number) > (out.cursor[st] as number))) out.cursor[st] = b.cursor[st];
    out.heard[st] = out.heard[st] ?? b.heard[st];
  }
  out.drafts = { ...b.drafts, ...out.drafts };
  for (const [k, v] of Object.entries(b.drafts)) if ((v?.length ?? 0) > (out.drafts[k]?.length ?? 0)) out.drafts[k] = v;
  return out;
}

export class MockStore {
  readonly id: number;
  state: LocalState;
  private dirty: Record<CoceStage, Set<string>> = { co: new Set(), ce: new Set() };
  private timer: ReturnType<typeof setTimeout> | null = null;
  private netDown = false;
  private subs = new Set<(down: boolean) => void>();
  private closed = false;

  private constructor(id: number, state: LocalState) { this.id = id; this.state = state; }

  /** the three copies brought together, the server's answers laid under them; what the server lacks is sent */
  static async open(id: number, server: Record<CoceStage, Record<string, Answer>>): Promise<MockStore> {
    const local = readLocal(id);
    const stored = sane((await idb<LocalState>("readonly", (s) => s.get(id))) ?? null, id);
    const st = local ? merge(sane(local, id), stored) : stored;
    const store = new MockStore(id, st);
    for (const stage of ["co", "ce"] as const) {
      for (const [k, v] of Object.entries(server[stage] ?? {})) if (!(k in st.answers[stage])) st.answers[stage][k] = v;
      for (const [k, v] of Object.entries(st.answers[stage])) if (server[stage]?.[k] !== v) store.dirty[stage].add(k);
    }
    store.persist();
    if (store.dirty.co.size || store.dirty.ce.size) store.schedule(0);
    const away = () => { if (document.visibilityState === "hidden") void store.send(true); };
    const back = () => void store.send();
    document.addEventListener("visibilitychange", away);
    window.addEventListener("pagehide", () => void store.send(true));
    window.addEventListener("online", back);
    return store;
  }

  answers(stage: CoceStage) { return this.state.answers[stage]; }
  get isNetDown() { return this.netDown; }
  subscribe(f: (down: boolean) => void) { this.subs.add(f); return () => { this.subs.delete(f); }; }

  setAnswer(stage: CoceStage, qid: string, key: Answer) {
    if (this.state.answers[stage][qid] === key) return;
    this.state.answers[stage][qid] = key;
    this.state.stamps[stage][qid] = serverNow();
    this.dirty[stage].add(qid);
    this.persist();
  }
  setCursor(stage: CoceStage, index: number) { if (this.state.cursor[stage] === index) return; this.state.cursor[stage] = index; this.persist(); }
  setHeard(stage: CoceStage, qid: string | null) { if (this.state.heard[stage] === qid) return; this.state.heard[stage] = qid; this.persist(); }
  setDraft(taskNo: number, text: string) { if (this.state.drafts[String(taskNo)] === text) return; this.state.drafts[String(taskNo)] = text; this.persist(); }

  /** the three local copies, at once */
  private persist() {
    try { localStorage.setItem(lsKey(this.id), JSON.stringify(this.state)); } catch { /* full or blocked: the other copies stand */ }
    void idb("readwrite", (s) => s.put(this.state));
  }
  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.send(), ms);
  }
  private tell(down: boolean) { if (this.netDown !== down) { this.netDown = down; this.subs.forEach((f) => f(down)); } }

  /** every answer the server does not have yet; on a failure they stay dirty and go out again in ten seconds */
  async send(keepalive = false): Promise<void> {
    if (this.timer) { clearTimeout(this.timer); this.timer = null; }
    if (this.closed) return;
    for (const stage of ["co", "ce"] as const) {
      if (!this.dirty[stage].size) continue;
      const answers: Record<string, Answer> = {};
      const sent = [...this.dirty[stage]];
      for (const k of sent) answers[k] = this.state.answers[stage][k];
      try {
        await patchMock(this.id, stage, answers, keepalive);
        for (const k of sent) if (this.state.answers[stage][k] === answers[k]) this.dirty[stage].delete(k);
        this.tell(false);
      } catch (e) {
        const status = (e as { status?: number }).status ?? 0;
        // the stage is over on the server (late, finished): these answers will never be taken; nothing to retry
        if (status === 409) { this.dirty[stage].clear(); this.tell(false); continue; }
        this.tell(true);
        this.schedule(RETRY_MS);
        return;
      }
    }
  }
  /** the mock is over: the copies go */
  forget() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    try { localStorage.removeItem(lsKey(this.id)); } catch { /* fine */ }
    void idb("readwrite", (s) => s.delete(this.id));
  }
}
