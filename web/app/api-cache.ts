// This browser's copy of what the server already said (the free plan counts every request and every row read).
// The reads that only change when this person saves something — the dashboard's numbers, the exam lists, the practice
// progress, the writing and speaking sessions, the mock exams (BUNDLE) — come together: GET /me brings, along with the
// profile, the ones this browser does not hold (one request when the app opens), and moving between screens asks
// nothing. A save marks out of date only what it can change (a practice sync: the progress and the numbers; a draft:
// nothing); the next screen that needs one of them gets them all again in one request. A copy also ages out after an
// hour (something done on another device). Every response sets the server's clock (its Date header).
import { api } from "./api.ts";
import { noteServerDate } from "./coce/room/hooks.ts";

const KEY = "tcfm-cache";
export const HOUR = 60 * 60_000;

/** the reads that travel with GET /me (?with=…) */
export const BUNDLE = ["/attempts?section=co", "/attempts?section=ce", "/progress?section=co", "/progress?section=ce", "/expr/sessions", "/mock/list"] as const;
export type BundleKey = (typeof BUNDLE)[number];
const inBundle = (p: string): p is BundleKey => (BUNDLE as readonly string[]).includes(p);

/** which kept reads a change can alter, by the path it is sent to (first match wins); [] = none, "all" = everything */
const CHANGES: [RegExp, string[] | "all"][] = [
  [/^\/api\/expr\/(ecrit\/draft|oral\/log|oral\/segment|oral\/prepare|oral\/realtime|oral\/chunk)/, []],
  [/^\/api\/sync/, ["/progress?section=co", "/progress?section=ce", "/me/stats"]],
  [/^\/api\/attempts/, ["/attempts?section=co", "/attempts?section=ce", "/me/stats"]],
  [/^\/api\/expr\//, ["/expr/sessions", "/me/stats"]],
  [/^\/api\/mock/, ["/mock/list", "/me/stats", "/attempts?section=co", "/attempts?section=ce", "/expr/sessions"]],
  [/^\/api\/disputes/, ["/disputes"]],
  [/^\/api\/me(\/key)?$/, ["/me/stats"]],
  [/^\/api\/donate/, []],
];

type Entry = { at: number; data: unknown };
type Box = { u: string; e: Record<string, Entry> };
/** until GET /me answers, the copies are taken to be those of the person who used this browser last (GET /me must
 *  already say what it lacks); setCacheOwner drops them if it turns out to be someone else */
let owner = (() => { try { return (JSON.parse(localStorage.getItem(KEY) ?? "null") as Box | null)?.u ?? ""; } catch { return ""; } })();

function read(): Box | null {
  try {
    const b = JSON.parse(localStorage.getItem(KEY) ?? "null") as Box | null;
    return b && b.u === owner && b.e ? b : null;
  } catch { return null; }
}
function write(b: Box) {
  try { localStorage.setItem(KEY, JSON.stringify(b)); }
  catch { try { localStorage.removeItem(KEY); } catch { /* blocked: nothing kept, everything asked */ } }
}

/** whose copies these are; another person (or nobody) on this browser: everything kept is dropped */
export function setCacheOwner(id: string | null) {
  owner = id ?? "";
  try { const b = JSON.parse(localStorage.getItem(KEY) ?? "null") as Box | null; if (b && b.u !== owner) localStorage.removeItem(KEY); } catch { /* fine */ }
}
export const clearCache = () => { try { localStorage.removeItem(KEY); } catch { /* fine */ } };
/** drop the copies a change can alter (a path starting with one of `prefixes`) */
function drop(prefixes: string[]) {
  const b = read();
  if (!b) return;
  let changed = false;
  for (const k of Object.keys(b.e)) if (prefixes.some((p) => k === p || k.startsWith(p))) { delete b.e[k]; changed = true; }
  if (changed) write(b);
}

/** what is kept for this path, however old (to show at once), or null */
export function peek<T>(path: string): T | null {
  return (read()?.e[path]?.data as T | undefined) ?? null;
}
/** keep an answer the app already has (a finish returns the finished attempt: its result page needs no request) */
export function keep(path: string, data: unknown) {
  if (!owner) return;
  const b = read() ?? { u: owner, e: {} };
  b.e[path] = { at: Date.now(), data };
  // at most 60 copies, the newest kept
  const keys = Object.keys(b.e);
  if (keys.length > 60) keys.sort((x, y) => b.e[x].at - b.e[y].at).slice(0, keys.length - 60).forEach((k) => delete b.e[k]);
  write(b);
}
export const isFresh = (path: string, maxAge = HOUR) => { const hit = read()?.e[path]; return !!hit && Date.now() - hit.at < maxAge; };

/** the bundle's reads this browser lacks (or holds for more than an hour) */
export const staleBundle = (): BundleKey[] => BUNDLE.filter((k) => !isFresh(k));
/** the reads GET /me brought (`extra`): kept, each under its own path */
export function keepBundle(extra: Record<string, unknown> | undefined) {
  if (!extra) return;
  for (const [k, v] of Object.entries(extra)) if (inBundle(k) && v != null) keep(k, v);
}

let bundleInFlight: Promise<void> | null = null;
/** one GET /me for every stale read of the bundle (screens asking at the same moment share it) */
function refreshBundle(): Promise<void> {
  if (bundleInFlight) return bundleInFlight;
  const want = staleBundle();
  bundleInFlight = (want.length ? api<{ extra?: Record<string, unknown> }>(`/me?with=${encodeURIComponent(want.join(","))}`).then((d) => keepBundle(d.extra)) : Promise.resolve())
    .finally(() => { bundleInFlight = null; });
  return bundleInFlight;
}

/** the kept answer while it is younger than `maxAge`, else asked now (and kept); a read of the bundle is asked with
 *  all the others that are out of date, in one request */
export async function cached<T>(path: string, maxAge = HOUR): Promise<T> {
  const hit = read()?.e[path];
  if (hit && Date.now() - hit.at < maxAge) return hit.data as T;
  if (inBundle(path) && owner) {
    await refreshBundle().catch(() => null);
    const again = read()?.e[path];
    if (again) return again.data as T;
  }
  const data = await api<T>(path);
  keep(path, data);
  return data;
}

/** watch every request this page sends: a change drops what it can alter; every answer sets the server's clock */
export function watchRequests() {
  if (typeof window === "undefined" || (window as { __apiWatch?: boolean }).__apiWatch) return;
  (window as { __apiWatch?: boolean }).__apiWatch = true;
  const plain = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let ours = false;
    try {
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url, location.href);
      ours = url.pathname.startsWith("/api/");
      if (ours && method !== "GET" && method !== "HEAD") {
        const rule = CHANGES.find(([re]) => re.test(url.pathname));
        if (!rule || rule[1] === "all") clearCache(); else drop(rule[1]);
      }
    } catch { /* never in the way */ }
    const p = plain(input, init);
    if (ours) p.then((r) => { try { noteServerDate(r); } catch { /* fine */ } }, () => {});
    return p;
  };
}
