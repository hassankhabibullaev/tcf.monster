/**
 * What the person wrote and said, and its corrections, live only in the browser that made them (IndexedDB), never on
 * the server: the writing drafts and texts, the speaking turns (her lines and Google's text of each answer), the
 * evaluation with its reasons and tips, the complete list of mistakes, the rewrites. The server keeps the subject
 * and the marks (worker/sim/results.ts); a session read from it is completed here (`loadSession`), and on another
 * device it shows the marks alone. Kept until the person deletes the session or the account, or clears the browser.
 * Every call swallows its errors: when storage is unavailable the session still works, there is nothing to show later.
 */
import { api } from "../api.ts";
import type { StoredSession } from "../expr.ts";
import type { Turn } from "./types";

export type Work = {
  /** `${sessionId}:${taskNo}` */
  id: string;
  sessionId: string;
  taskNo: number;
  owner: string;
  text?: string;
  turns?: Turn[];
  /** JSON: the full evaluation (shared/sim/eval/evaluate.ts) */
  evaluation?: string | null;
  /** JSON: the complete list of mistakes */
  detail?: string | null;
  /** JSON: the rewrites (writing) */
  versions?: string | null;
  savedAt: number;
};

const DB = "tcfm-work";
const STORE = "tasks";
const idOf = (sessionId: string, taskNo: number) => `${sessionId}:${taskNo}`;

let owner = "";
/** set by the app once GET /me answered (main.tsx): a shared computer keeps each person's work apart */
export const setWorkOwner = (id: string | null) => { owner = id ?? ""; };

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: "id" });
          st.createIndex("session", "sessionId");
          st.createIndex("owner", "owner");
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function run<T>(mode: IDBTransactionMode, f: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) return resolve(null);
        try {
          const tx = db.transaction(STORE, mode);
          const req = f(tx.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          tx.oncomplete = () => db.close();
          tx.onerror = () => db.close();
        } catch {
          resolve(null);
        }
      }),
  );
}

export async function getWork(sessionId: string, taskNo: number): Promise<Work | null> {
  const w = (await run("readonly", (s) => s.get(idOf(sessionId, taskNo)))) as Work | null;
  return w && w.owner === owner ? w : null;
}

// one change at a time per task: two writes arriving together (an answer and her line) never overwrite each other
const chains = new Map<string, Promise<unknown>>();
function serial<T>(id: string, f: () => Promise<T>): Promise<T> {
  const next = (chains.get(id) ?? Promise.resolve()).then(f, f);
  chains.set(id, next.catch(() => null));
  return next;
}

/** merges `patch` into the task's work; `f` may also compute it from what is kept */
export function putWork(sessionId: string, taskNo: number, patch: Partial<Omit<Work, "id" | "sessionId" | "taskNo" | "owner" | "savedAt">> | ((w: Work | null) => Partial<Work>)): Promise<void> {
  const id = idOf(sessionId, taskNo);
  return serial(id, async () => {
    const old = await getWork(sessionId, taskNo);
    const p = typeof patch === "function" ? patch(old) : patch;
    await run("readwrite", (s) => s.put({ ...(old ?? {}), ...p, id, sessionId, taskNo, owner, savedAt: Date.now() } satisfies Work));
  });
}

export async function workOfSession(sessionId: string): Promise<Work[]> {
  const all = (await run("readonly", (s) => s.index("session").getAll(sessionId))) as Work[] | null;
  return (all ?? []).filter((w) => w.owner === owner);
}

/** a session deleted from the history: its work goes from this device too */
export async function dropSessionWork(sessionId: string): Promise<void> {
  for (const w of await workOfSession(sessionId)) await run("readwrite", (s) => s.delete(w.id));
}

/** the account deleted: everything this device kept for the person */
export async function dropAllWork(): Promise<void> {
  if (!owner) return;
  const keys = (await run("readonly", (s) => s.index("owner").getAllKeys(owner))) as IDBValidKey[] | null;
  for (const k of keys ?? []) await run("readwrite", (s) => s.delete(k));
}

/* ---------- the speaking log ---------- */

export type LogItem = { taskNo?: number; clipId?: string; register?: boolean; durationS?: number; candidateText?: string; examinerText?: string; elapsedS?: number; latencyMs?: number | null };

/**
 * The speaking room's log, kept here as the turns of each task: an answer's registration (its clip stays in
 * clips.ts, its text comes with Google's transcription or at the marking), Google's text of an answer, one of her
 * lines. An answer registered twice is kept once; the turns stay in time order.
 */
export async function applyLog(sessionId: string, items: LogItem[]): Promise<void> {
  // the same cleaning and order as the marking (loaded with the speaking room, not with the app)
  const { clean, byTime } = await import("../../../shared/sim/oral-core.ts");
  const byTask = new Map<number, LogItem[]>();
  for (const it of items) {
    const n = [1, 2, 3].includes(Number(it.taskNo)) ? Number(it.taskNo) : 1;
    byTask.set(n, [...(byTask.get(n) ?? []), it]);
  }
  for (const [taskNo, list] of byTask) {
    await putWork(sessionId, taskNo, (w) => {
      const turns: Turn[] = [...(w?.turns ?? [])];
      for (const it of list) {
        if (it.register === true && typeof it.clipId === "string") {
          if (turns.some((u) => u.role === "candidate" && u.clipId === it.clipId)) continue;
          const durationS = Number(it.durationS) || 0;
          turns.push({ role: "candidate", text: "(inaudible)", t: Math.max(0, (Number(it.elapsedS) || 0) - durationS), clipId: it.clipId, durationS, stitched: true });
        } else if (typeof it.candidateText === "string") {
          const i = turns.findIndex((u) => u.role === "candidate" && u.clipId === it.clipId);
          const text = clean(it.candidateText);
          if (i >= 0 && text) { const { stitched: _s, ...rest } = turns[i]; void _s; turns[i] = { ...rest, text }; }
        } else if (typeof it.examinerText === "string") {
          turns.push({ role: "examiner", text: it.examinerText, t: Number(it.elapsedS) || 0, ...(it.latencyMs != null && Number.isFinite(Number(it.latencyMs)) ? { latencyMs: Math.round(Number(it.latencyMs)) } : {}) });
        }
      }
      return { turns: turns.sort(byTime) };
    });
  }
}

/* ---------- a session as the room and the result page need it ---------- */

/**
 * The server's copy of a session (subjects, statuses, marks), completed with what this device kept. A marked task
 * with nothing here shows its marks alone (`elsewhere`: done on another device, or this browser was cleared).
 */
export async function withWork(d: StoredSession): Promise<StoredSession> {
  const kept = new Map((await workOfSession(d.session.id)).map((w) => [w.taskNo, w]));
  return {
    ...d,
    tasks: d.tasks.map((t) => {
      const w = kept.get(t.taskNo);
      return {
        ...t,
        responseText: w?.text ?? null,
        turnsJson: JSON.stringify(w?.turns ?? []),
        feedbackJson: w?.evaluation ?? t.marksJson ?? null,
        detailJson: w?.detail ?? null,
        versionsJson: w?.versions ?? null,
        elsewhere: t.status === "done" && !w?.evaluation,
      };
    }),
  };
}

export async function loadSession(id: string): Promise<StoredSession> {
  return withWork(await api<StoredSession>(`/expr/session/${encodeURIComponent(id)}`));
}
