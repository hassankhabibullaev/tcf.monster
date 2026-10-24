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
export function day(tz: string, at = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

export const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString();

/** count rows written today; the hold line is where the app stops writing progress. The count is an estimate: it is
 *  added up in this Worker's memory and written once 25 have gathered or a minute has passed (writing it every time
 *  doubled the writes it was there to save). An instance that stops loses at most its last few, which is fine. */
export const BUDGET_HOLD = 60000;
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
export const resetWrites = () => { pendingWrites = 0; pendingDay = ""; lastFlush = 0; };

/** longest JSON body any route reads (the biggest legitimate one, a writing text of 8 000 characters, is far below) */
export const MAX_JSON = 1024 * 1024;
/** the body as JSON, or null when it is not JSON or is too long to be ours */
export async function readJson<T>(req: Request): Promise<T | null> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_JSON) return null;
  try {
    const text = await req.text();
    if (text.length > MAX_JSON) return null;
    return JSON.parse(text) as T;
  } catch { return null; }
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
