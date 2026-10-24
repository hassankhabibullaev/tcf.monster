// The browser's copy of a person's practice progress (docs/COCE.md §2). Browser-first: an answer becomes an event,
// applied here at once, kept in localStorage (`tcfm-queue:<user id>`, one queue per person who signs in on this
// browser) and sent to POST /api/sync in bundles — about 1 minute after the last event, at most 3 minutes after the
// first, and when the tab is hidden (keepalive). The free plan counts every request and every row written: each bundle
// writes ~3 rows, so a bundle a minute was ~180 writes an hour of practice. The server's rows are read once per section per visit; the queue is laid over
// them. `{hold}` and 401 keep the queue silently; so does a lost network.
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { api, unauthorized } from "../api.ts";
import { cached } from "../api-cache.ts";
import { apply, emptyState, LEVELS, type Event, type Level, type State } from "../../../shared/progress.ts";
import type { Key, Question, Section } from "./bank.ts";

export type { Event, Level, State };

/** the queue from before accounts were told apart (one browser, one person); adopted by the next owner this browser sees */
const LEGACY_KEY = "tcfm-queue";
const OWNER_KEY = "tcfm-owner";
const SOON_MS = 60_000;
const MAX_MS = 180_000;
const HOLD_MS = 15 * 60_000;
const RETRY_MS = 60_000;

type Levels = Record<Level, State>;
type Load = "idle" | "loading" | "ready" | "failed";

let base: Partial<Record<Section, Levels>> = {};
const load: Record<Section, Load> = { co: "idle", ce: "idle" };
/** the signed-in person's id: the queue is theirs and theirs only (nothing is queued or sent before it is known) */
let owner: string | null = null;
let queue: Event[] = [];
/** ids sent and acknowledged by the server in this tab: never re-queued from storage */
const acked = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
const emit = () => { version++; for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

// ---- storage (every call may throw: full, blocked, private window) ----
const queueKey = () => (owner ? `tcfm-queue:${owner}` : null);
function readKey(key: string | null): Event[] {
  if (!key) return [];
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((e) => e && typeof e.id === "string" && typeof e.t === "number") : [];
  } catch { return []; }
}
const readQueue = () => readKey(queueKey());
function writeQueue() {
  const key = queueKey();
  if (!key) return;
  try {
    if (queue.length) localStorage.setItem(key, JSON.stringify(queue));
    else localStorage.removeItem(key);
  } catch { /* the tab's memory still holds it */ }
}
/** another tab may have added events since we last looked: take them in, keep what this tab already saw confirmed */
function mergeStored() {
  const mine = new Set(queue.map((e) => e.id));
  const extra = readQueue().filter((e) => !mine.has(e.id) && !acked.has(e.id));
  if (extra.length) queue = [...queue, ...extra].sort((a, b) => a.t - b.t);
}

/**
 * Who is signed in. Called before the screens render for them (main.tsx, as soon as /me answers) and again with null
 * at sign-out. A change of person forgets the other one's server copy and leaves their unsent answers under their own
 * key (sent when they sign in again here); the new person's own waiting answers come back and go out.
 */
export function setOwner(id: string | null) {
  if (id === owner) return;
  clearTimers();
  base = {};
  load.co = load.ce = "idle";
  viewCache.clear();
  sectionCache.clear();
  acked.clear();
  owner = id;
  queue = [];
  if (id) {
    try {
      // the queue from before accounts were told apart belongs to whoever this browser last signed in (or nobody known)
      const last = localStorage.getItem(OWNER_KEY);
      const legacy = readKey(LEGACY_KEY);
      if (legacy.length && (!last || last === id)) { queue = legacy; writeQueue(); }
      localStorage.removeItem(LEGACY_KEY);
      localStorage.setItem(OWNER_KEY, id);
    } catch { /* storage blocked: nothing to adopt */ }
    mergeStored();
    if (queue.length) schedule();
  }
  emit();
}
export const ownerId = () => owner;

/**
 * Leaving the device to someone else (sign-out, account deleted): what this browser kept of the person's work goes —
 * writing drafts, the marks waiting on a results page, an exam's answers, the recordings. Everything in it is on the
 * server already (drafts every ten seconds, answers within two) except what a lost network held back, which the
 * queue of practice answers keeps under the person's own key for their next sign-in here.
 */
export function forgetDevice() {
  try {
    const keysOf = (st: Storage) => Array.from({ length: st.length }, (_, i) => st.key(i)).filter((k): k is string => !!k);
    for (const k of keysOf(localStorage)) if (/^tcfm-(draft|progress|exam|active-session)/.test(k)) localStorage.removeItem(k);
    for (const k of keysOf(sessionStorage)) if (k.startsWith("expr-session-")) sessionStorage.removeItem(k);
  } catch { /* storage blocked */ }
  try { indexedDB.deleteDatabase("tcfm-clips"); } catch { /* none */ }
}

// ---- the view: server rows + the queue ----
const viewCache = new Map<string, { version: number; state: State }>();
function levelState(section: Section, level: Level): State {
  const k = `${section}/${level}`;
  const hit = viewCache.get(k);
  if (hit && hit.version === version) return hit.state;
  let s = base[section]?.[level] ?? emptyState();
  for (const e of queue) if (e.section === section && e.level === level) s = apply(s, e);
  viewCache.set(k, { version, state: s });
  return s;
}
const sectionCache = new Map<Section, { version: number; levels: Levels }>();
function sectionLevels(section: Section): Levels | null {
  if (load[section] !== "ready" && load[section] !== "failed") return null;
  const hit = sectionCache.get(section);
  if (hit && hit.version === version) return hit.levels;
  const levels = Object.fromEntries(LEVELS.map((l) => [l, levelState(section, l)])) as Levels;
  sectionCache.set(section, { version, levels });
  return levels;
}

// ---- loading from the server, once per section per visit ----
async function ensureLoaded(section: Section, force = false) {
  if (!force && load[section] !== "idle" && load[section] !== "failed") return;
  load[section] = "loading";
  emit();
  try {
    // the server's rows as kept in this browser (a sync from here clears the copy; another device's work shows within
    // ten minutes); this browser's own queue is laid over them in any case. A retry after a failure asks the server.
    const d = force ? await api<{ levels: Partial<Record<Level, State>> }>(`/progress?section=${section}`) : await cached<{ levels: Partial<Record<Level, State>> }>(`/progress?section=${section}`);
    base[section] = Object.fromEntries(LEVELS.map((l) => [l, d.levels?.[l] ?? emptyState()])) as Levels;
    load[section] = "ready";
  } catch {
    // signed out or no network: the room still works on what is here; the queue waits
    base[section] ??= Object.fromEntries(LEVELS.map((l) => [l, emptyState()])) as Levels;
    load[section] = "failed";
    setTimeout(() => { if (load[section] === "failed") void ensureLoaded(section, true); }, RETRY_MS);
  }
  emit();
}

// ---- sending ----
let soonTimer: ReturnType<typeof setTimeout> | null = null;
let maxTimer: ReturnType<typeof setTimeout> | null = null;
let holdUntil = 0;
let sending: Promise<void> | null = null;

function schedule() {
  if (soonTimer) clearTimeout(soonTimer);
  soonTimer = setTimeout(() => void flush(), SOON_MS);
  if (!maxTimer) maxTimer = setTimeout(() => void flush(), MAX_MS);
}
function clearTimers() {
  if (soonTimer) clearTimeout(soonTimer);
  if (maxTimer) clearTimeout(maxTimer);
  soonTimer = maxTimer = null;
}

/** send everything waiting now; `leaving` uses keepalive so the request outlives the tab */
export function flush(leaving = false): Promise<void> {
  if (sending) return sending;
  clearTimers();
  mergeStored();
  if (!owner || !queue.length || Date.now() < holdUntil) return Promise.resolve();
  const who = owner;
  const sent = queue.slice(0, 300);
  sending = (async () => {
    try {
      const r = await fetch("/api/sync", {
        method: "POST", credentials: "same-origin", keepalive: leaving,
        headers: { "content-type": "application/json" }, body: JSON.stringify({ events: sent }),
      });
      if (owner !== who) return; // someone else signed in meanwhile: this answer is not theirs to fold in
      if (r.status === 401) { unauthorized(); return; } // signed out: the queue waits for the next sign-in; the app shows the door
      if (!r.ok) { schedule(); return; }
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; hold?: boolean };
      if (d.hold) { holdUntil = Date.now() + HOLD_MS; setTimeout(() => void flush(), HOLD_MS); return; }
      if (!d.ok) { schedule(); return; }
      // confirmed: the same rules fold them into the server copy, so the view does not move
      const ids = new Set(sent.map((e) => e.id));
      for (const e of sent) {
        const b = base[e.section];
        if (b) b[e.level] = apply(b[e.level], e);
        acked.add(e.id);
      }
      queue = queue.filter((e) => !ids.has(e.id));
      writeQueue();
      emit();
      if (queue.length) schedule();
    } catch {
      if (owner === who) schedule(); // no network: try again later
    } finally {
      sending = null;
    }
  })();
  return sending;
}

export const pendingCount = () => queue.length;

function push(ev: Event) {
  if (!owner) return; // nobody signed in: nothing to keep (the rooms never open before /me answered)
  queue = [...queue, ev];
  writeQueue();
  emit();
  schedule();
}

let lastT = 0;
/** seconds since epoch, strictly increasing within this tab so two events on one question never tie */
function stamp() {
  const t = Math.max(Date.now() / 1000, lastT + 0.001);
  lastT = t;
  return Math.round(t * 1000) / 1000;
}
const uuid = () => (typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && queue.length) void flush(true); });
  window.addEventListener("pagehide", () => { if (queue.length) void flush(true); });
  window.addEventListener("online", () => { if (queue.length) void flush(); });
}

// ---- hooks ----
export type LevelStore = {
  state: State;
  /** applies the answer at once; returns whether it was right */
  answer: (q: Question, key: Key, dt?: number) => boolean;
  mark: (qid: string, s: "green" | "amber") => void;
  reset: (qid: string) => void;
  setPos: (n: number) => void;
  /** nothing of this level waits to be sent */
  synced: boolean;
};

/** the four things a room does to a level, as plain calls (the hook below wraps them; tests call them directly) */
export const record = {
  answer(section: Section, level: Level, q: Question, key: Key, dt?: number) {
    const right = key === q.answer;
    push({ id: uuid(), section, level, t: stamp(), type: "answer", qid: q.id, key, right, ...(dt !== undefined ? { dt: Math.max(0, Math.min(600, Math.round(dt))) } : {}) });
    return right;
  },
  mark(section: Section, level: Level, qid: string, s: "green" | "amber") { push({ id: uuid(), section, level, t: stamp(), type: "mark", qid, s }); },
  reset(section: Section, level: Level, qid: string) { push({ id: uuid(), section, level, t: stamp(), type: "reset", qid }); },
  pos(section: Section, level: Level, n: number) { if (levelState(section, level).pos !== n) push({ id: uuid(), section, level, t: stamp(), type: "pos", n }); },
};
/** what a level looks like right now (server copy + the queue), outside React */
export const stateOf = (section: Section, level: Level) => levelState(section, level);
/** the server rows, read when idle; for tests and the hooks */
export const load_ = (section: Section, force = false) => ensureLoaded(section, force);

export function useLevel(section: Section, level: Level): LevelStore {
  useEffect(() => { void ensureLoaded(section); }, [section]);
  const state = useSyncExternalStore(subscribe, () => levelState(section, level));
  const synced = useSyncExternalStore(subscribe, () => !queue.some((e) => e.section === section && e.level === level));
  const answer = useCallback((q: Question, key: Key, dt?: number) => record.answer(section, level, q, key, dt), [section, level]);
  const mark = useCallback((qid: string, s: "green" | "amber") => record.mark(section, level, qid, s), [section, level]);
  const reset = useCallback((qid: string) => record.reset(section, level, qid), [section, level]);
  const setPos = useCallback((n: number) => record.pos(section, level, n), [section, level]);
  return { state, answer, mark, reset, setPos, synced };
}

export function useSection(section: Section): { levels: Levels | null; refresh: () => Promise<void> } {
  useEffect(() => { void ensureLoaded(section); }, [section]);
  const levels = useSyncExternalStore(subscribe, () => sectionLevels(section));
  const refresh = useCallback(() => ensureLoaded(section, true), [section]);
  return { levels, refresh };
}
