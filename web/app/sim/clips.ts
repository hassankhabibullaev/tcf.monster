/**
 * The candidate's recordings live only in the browser that made them (IndexedDB), never on the server: a clip is
 * kept here when an answer ends, sent once in the finish form of its task (the server marks it and keeps nothing),
 * played back from here on the results page, and erased after thirty days. Every call swallows its errors: when
 * storage is unavailable the session still works, there is simply no playback later.
 */
export type Clip = { clipId: string; sessionId: string; taskNo: number; blob: Blob; durationS: number; savedAt: number };

const DB = "tcfm-clips";
const STORE = "clips";
export const CLIP_TTL_MS = 30 * 24 * 3600 * 1000;
/** the finish form stays under this (the server's limit is 20 MB) */
export const UPLOAD_BUDGET = 19 * 1024 * 1024;

export const newClipId = () => `c_${Date.now().toString(36)}_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const st = db.createObjectStore(STORE, { keyPath: "clipId" });
          st.createIndex("session", "sessionId");
          st.createIndex("savedAt", "savedAt");
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

export async function keepClip(c: Omit<Clip, "savedAt">): Promise<void> {
  await run("readwrite", (s) => s.put({ ...c, savedAt: Date.now() } satisfies Clip));
}

export async function getClip(clipId: string): Promise<Clip | null> {
  const c = (await run("readonly", (s) => s.get(clipId))) as Clip | null;
  return c && c.blob instanceof Blob ? c : null;
}

/** the clips of a session (one task's when given), in the order they were recorded */
export async function clipsOf(sessionId: string, taskNo?: number): Promise<Clip[]> {
  const all = (await run("readonly", (s) => s.index("session").getAll(sessionId))) as Clip[] | null;
  return (all ?? []).filter((c) => c.blob instanceof Blob && (taskNo == null || c.taskNo === taskNo)).sort((a, b) => a.savedAt - b.savedAt);
}

/** which of these clips this device still has */
export async function presentClips(ids: string[]): Promise<Set<string>> {
  const out = new Set<string>();
  for (const id of ids) if (await getClip(id)) out.add(id);
  return out;
}

/** On app start: clips older than thirty days go. */
export async function sweepClips(): Promise<void> {
  const limit = Date.now() - CLIP_TTL_MS;
  const old = (await run("readonly", (s) => s.index("savedAt").getAllKeys(IDBKeyRange.upperBound(limit)))) as IDBValidKey[] | null;
  for (const k of old ?? []) await run("readwrite", (s) => s.delete(k));
}
