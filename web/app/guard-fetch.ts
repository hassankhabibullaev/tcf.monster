// The abuse guard's answers, for every call this app makes to its own server (worker/guard.ts). Installed once, at
// start (main.tsx), around window.fetch, so every caller — the API helper, the bank's files, the marking — gets it:
//   429 { error: "human" }   Cloudflare's human check (Turnstile) shows; its token goes with the same request again.
//                            One check for every request waiting on it at once.
//   403 { error: "blocked" } the account is blocked: the door, which says why and whom to write to.
import { humanToken } from "./turnstile.ts";

let passing: Promise<string | null> | null = null;

function ours(input: RequestInfo | URL): boolean {
  if (typeof input !== "string" && !(input instanceof URL)) return false;
  const u = new URL(String(input), location.origin);
  return u.origin === location.origin && (u.pathname.startsWith("/api/") || u.pathname.startsWith("/data/")) && !u.pathname.startsWith("/api/auth/");
}

export function installGuardFetch() {
  const plain = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const first = await plain(input, init);
    if (!ours(input) || (first.status !== 429 && first.status !== 403)) return first;
    const d = (await first.clone().json().catch(() => null)) as { error?: string; turnstile?: string | null } | null;
    if (first.status === 403) {
      if (d?.error === "blocked" && !location.pathname.startsWith("/sign-in")) location.replace("/sign-in?blocked");
      return first;
    }
    if (d?.error !== "human" || !d.turnstile) return first;
    // one check for everything waiting: the first asker shows it, the others reuse its token
    const sitekey = d.turnstile;
    if (!passing) {
      const lang = document.documentElement.lang === "en" ? "en" : "fr";
      passing = humanToken(sitekey, "human", lang).catch(() => null);
      passing.finally(() => setTimeout(() => { passing = null; }, 0));
    }
    const token = await passing;
    if (!token) return first;
    const headers = new Headers(init?.headers);
    headers.set("x-turnstile", token);
    return plain(input, { ...init, headers });
  };
}
