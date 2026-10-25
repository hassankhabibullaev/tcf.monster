// The abuse guard's answers, for every call this app makes to its own server (worker/guard.ts). Installed once, at
// start (main.tsx), around window.fetch, so every caller — the API helper, the bank's files, the marking — gets it:
//   429 { error: "human" }   Cloudflare's human check (Turnstile) shows; its token goes with the same request again.
//                            One check for every request waiting on it at once. Failing it never blocks: the next
//                            request simply asks again.
//   403 { error: "blocked" } the account is blocked: the door, which says why and whom to write to.
//   x-quiet-check: <key>     today's invisible check: run once, unseen unless Cloudflare wants a click; its token (or
//                            « failed ») rides with the next request as x-quiet. No request of its own.
// Each request also carries this browser's clues when it has any (web/app/signs.ts, x-signs).
import { humanToken } from "./turnstile.ts";
import { clues, countWrite } from "./signs.ts";

let passing: Promise<string | null> | null = null;
/** the invisible check: running (a promise), or its answer waiting for the next request */
let quietRun: Promise<void> | null = null;
let quietAnswer: string | null = null;

function ours(input: RequestInfo | URL): boolean {
  if (typeof input !== "string" && !(input instanceof URL)) return false;
  const u = new URL(String(input), location.origin);
  return u.origin === location.origin && (u.pathname.startsWith("/api/") || u.pathname.startsWith("/data/")) && !u.pathname.startsWith("/api/auth/");
}

const lang = () => (document.documentElement.lang === "en" ? "en" : "fr");

function runQuiet(sitekey: string) {
  if (quietRun || quietAnswer) return;
  quietRun = humanToken(sitekey, "quiet", lang(), null, "interaction-only")
    .then((t) => { quietAnswer = t; }, () => { quietAnswer = "failed"; })
    .finally(() => { quietRun = null; });
}

export function installGuardFetch() {
  const plain = window.fetch.bind(window);
  clues(); // starts watching for hands
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!ours(input)) return plain(input, init);
    const method = (init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && method !== "HEAD") countWrite();
    const extra: Record<string, string> = {};
    const c = clues();
    if (c) extra["x-signs"] = c;
    if (quietAnswer) { extra["x-quiet"] = quietAnswer; quietAnswer = null; }
    const send = (more: Record<string, string> = {}) => {
      if (!Object.keys(extra).length && !Object.keys(more).length) return plain(input, init);
      const headers = new Headers(init?.headers);
      for (const [k, v] of Object.entries({ ...extra, ...more })) headers.set(k, v);
      return plain(input, { ...init, headers });
    };
    const first = await send();
    const quietKey = first.headers?.get?.("x-quiet-check");
    if (quietKey) runQuiet(quietKey);
    if (first.status !== 429 && first.status !== 403) return first;
    const d = (await first.clone().json().catch(() => null)) as { error?: string; turnstile?: string | null } | null;
    if (first.status === 403) {
      if (d?.error === "blocked" && !location.pathname.startsWith("/sign-in")) location.replace("/sign-in?blocked");
      return first;
    }
    if (d?.error !== "human" || !d.turnstile) return first;
    // one check for everything waiting: the first asker shows it, the others reuse its token
    const sitekey = d.turnstile;
    if (!passing) {
      passing = humanToken(sitekey, "human", lang(), null, "always").catch(() => null);
      passing.finally(() => setTimeout(() => { passing = null; }, 0));
    }
    const token = await passing;
    if (!token) return first;
    return send({ "x-turnstile": token });
  };
}
