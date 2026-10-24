import type { StartedSession } from "./types";

/** The session open in this browser (one at a time), kept in localStorage: a per-device safety copy, so a refresh or a detour does not lose it. */
export type ActiveSession = { session: StartedSession; startedAtMs: number; endAtMs: number; /** last moment the station was open in this browser */ seenAtMs?: number };
const KEY = "tcfm-active-session";
/** a session left open is offered again for this long; after that it is abandoned (no more scoring) */
export const RESUME_WINDOW_MS = 5 * 60 * 1000;

export function loadActive(): ActiveSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as ActiveSession;
    return a?.session?.sessionId ? a : null;
  } catch {
    return null;
  }
}
export function saveActive(a: ActiveSession | null) {
  try {
    if (a) localStorage.setItem(KEY, JSON.stringify(a));
    else localStorage.removeItem(KEY);
  } catch {}
}

/** the station is open: remembered every few seconds, so a closed tab is told from one still working */
export function touchActive() {
  const a = loadActive();
  if (a) saveActive({ ...a, seenAtMs: Date.now() });
}

/** the session left in this browser if it can still be taken up (seen less than five minutes ago, time not over); otherwise it is abandoned on the server and forgotten */
export function takeResumable(): ActiveSession | null {
  const a = loadActive();
  if (!a) return null;
  const seen = a.seenAtMs ?? a.startedAtMs;
  if (Date.now() - seen <= RESUME_WINDOW_MS && a.endAtMs > Date.now()) return a;
  saveActive(null);
  void fetch(`/api/expr/session/${a.session.sessionId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: "abandoned" }) }).catch(() => {});
  return null;
}
