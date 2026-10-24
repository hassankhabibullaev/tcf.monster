// Small helpers shared by every part of the Worker.

export type Env = {
  DB: D1Database;
  FILES: R2Bucket;
  ASSETS: Fetcher;
  APP_TZ: string;
  OWNER_EMAIL: string;
  /** "0": only a session of OWNER_EMAIL opens the admin. "1" opens it to anyone (only for local work). */
  ADMIN_OPEN: string;
  /** "1" once anyone may create an account; before that only OWNER_EMAIL and TESTERS (comma-separated) */
  APP_OPEN: string;
  TESTERS?: string;
  /** secret: mixed into every stored password (wrangler secret put PASSWORD_PEPPER) */
  PASSWORD_PEPPER?: string;
  /** Cloudflare Access in front of the admin: the team's address (…cloudflareaccess.com) and the admin application's
   *  audience tag; set, the admin also checks Access's signed token (worker/access.ts) */
  ACCESS_TEAM?: string;
  ACCESS_AUD?: string;
  /** "1" on this Mac only (scripts/local-env.ts): a stand-in pepper is allowed */
  LOCAL_DEV?: string;
  /** Cloudflare's rate limiter, shared by every server: 20 sign-in requests a minute per address (wrangler.app.jsonc) */
  AUTH_LIMIT?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
  /** one signed-in person's requests a minute, counted by Cloudflare across its servers (worker/guard.ts): past
   *  USER_PACE (90) the human check, past USER_BURST (240) after it a block */
  USER_PACE?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
  USER_BURST?: { limit: (o: { key: string }) => Promise<{ success: boolean }> };
  /** this Worker itself (wrangler.app.jsonc services): the nightly run calls each job through it */
  SELF?: { fetch: (req: Request) => Promise<Response> };
  RESEND_API_KEY?: string;
  /** secret: Brevo API key, the backup sender (free plan, 300 a day) once Resend's 100 a day are used */
  BREVO_API_KEY?: string;
  /** Turnstile, the bot check on sign-up codes: the public site key (a var) and the secret (wrangler secret put) */
  TURNSTILE_SITEKEY?: string;
  TURNSTILE_SECRET?: string;
  /** the addresses a Turnstile answer may come from, comma-separated (default tcf.monster) */
  TURNSTILE_HOSTNAMES?: string;
  /** secret: Stripe restricted key, Checkout Sessions write only; without it donations open the Ko-fi link */
  STRIPE_SECRET_KEY?: string;
  MAIL_FROM?: string;
  /** "1" on this Mac: codes are printed instead of e-mailed when Resend is not set */
  MAIL_LOG?: string;
  /** how many counted writes gather before the budget row is written (tests and this Mac: "1", exact) */
  WRITES_FLUSH_EVERY?: string;
};

export const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

export const fail = (status: number, error: string) => json({ error }, status);

export const nowIso = () => new Date().toISOString();

/** "2026-10-17" in the app's time zone */
const dayFormats = new Map<string, Intl.DateTimeFormat>();
/** the local day YYYY-MM-DD in a time zone (one formatter per zone, kept: making one costs about 0.1 ms) */
export function day(tz: string, at = new Date()) {
  let f = dayFormats.get(tz);
  if (!f) { f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }); if (dayFormats.size < 500) dayFormats.set(tz, f); }
  return f.format(at);
}

export const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

/** count rows written today; the hold line is where the app stops writing progress. The count is an estimate: it is
 *  added up in this Worker's memory and written once 25 have gathered or a minute has passed (writing it every time
 *  doubled the writes it was there to save). An instance that stops loses at most its last few, which is fine. */
export const BUDGET_HOLD = 50000;
let pendingWrites = 0, pendingDay = "", lastFlush = 0;
export async function addWrites(env: Env, n: number, now = Date.now()) {
  if (n <= 0) return;
  const today = day(env.APP_TZ);
  if (pendingDay && pendingDay !== today) await flushWrites(env);
  pendingDay = today;
  pendingWrites += n;
  if (pendingWrites >= Number(env.WRITES_FLUSH_EVERY || 25) || now - lastFlush > 60_000) await flushWrites(env, now);
}
export async function flushWrites(env: Env, now = Date.now()) {
  if (pendingWrites <= 0) return;
  const n = pendingWrites, d = pendingDay || day(env.APP_TZ);
  pendingWrites = 0; lastFlush = now;
  await env.DB.prepare("INSERT INTO budget (day, writes) VALUES (?, ?) ON CONFLICT(day) DO UPDATE SET writes = writes + excluded.writes")
    .bind(d, n).run();
}
/** a start (session · attempt · mock) noted for a person, with how many they started in the last 24 hours, every
 *  kind together. Nobody has a quota: the guard (worker/guard.ts) asks the human check, then blocks, only far beyond
 *  what anyone sits in a day. The rows live apart from what was started: deleting a session does not take one back. */
export async function claimStart(env: Env, userId: string, kind: "session" | "attempt" | "mock"): Promise<{ row: number; today: number }> {
  const r = await env.DB.prepare(`INSERT INTO starts (user_id, kind, at) VALUES (?1, ?2, ?3)
    RETURNING rowid, (SELECT COUNT(*) FROM starts WHERE user_id = ?1 AND at >= ?4) + 1 AS today`)
    .bind(userId, kind, nowIso(), daysAgoIso(1)).first<{ rowid: number; today: number }>();
  return { row: Number(r?.rowid ?? 0), today: Number(r?.today ?? 1) };
}
/** a start that did not happen after all (refused further on, or a double tap): its place is given back */
export const releaseStart = (env: Env, row: number) => env.DB.prepare("DELETE FROM starts WHERE rowid = ?").bind(row).run();
export const resetWrites = () => { pendingWrites = 0; pendingDay = ""; lastFlush = 0; };

/** longest JSON body any route reads (the biggest legitimate one, a writing text of 8 000 characters, is far below) */
export const MAX_JSON = 1024 * 1024;
/** the body as JSON, or null when it is not JSON or is too long to be ours */
export async function readJson<T>(req: Request): Promise<T | null> {
  const text = await readText(req, MAX_JSON);
  if (text === null) return null;
  try { return JSON.parse(text) as T; } catch { return null; }
}

/** a body read up to `max` bytes and no further (a body sent in chunks has no length to trust): null past it */
export async function readText(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get("content-length") ?? 0) > max) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) { await reader.cancel().catch(() => {}); return null; }
      parts.push(value);
    }
  } catch { return null; }
  const all = new Uint8Array(size);
  let at = 0;
  for (const p of parts) { all.set(p, at); at += p.byteLength; }
  return new TextDecoder().decode(all);
}

/* ---------- a small per-address limiter, in this isolate's memory (sign-in codes, passwords, donations) ---------- */
const hits = new Map<string, number[]>();
/** true when `key` may go on: at most `limit` calls in the last `windowMs`; `now` is for tests */
export function rateLimit(key: string, limit: number, windowMs = 60_000, now = Date.now()) {
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= limit) { hits.set(key, list); return false; }
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) for (const [k, v] of hits) if (now - (v[v.length - 1] ?? 0) >= windowMs) hits.delete(k);
  return true;
}
export const resetLimits = () => hits.clear();
/** the visitor's address as Cloudflare gives it; null on this Mac (no limit then) */
export const ipOf = (req: Request) => req.headers.get("cf-connecting-ip");
