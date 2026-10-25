// The guard against abuse. tcf.monster is free and volunteer-run, on Cloudflare's free plan: one script can use up
// the day's requests, writes or mails for everyone. Nobody has a quota: a person may sit every exam in a day, answer
// before a recording plays, or race through questions they know. What is watched is only what no person does:
//   1. a pace or a daily volume far beyond anyone studying (GUARD), and technical signs of a machine (SIGNS): a
//      browser driven by a program, events no hand made, answers at a machine's even beat, no answer to Cloudflare's
//      invisible check. Signs add up to a score; past ASK_AT, or past a soft line, the account must pass Cloudflare's
//      human check (Turnstile) before going on. A pass holds HUMAN_MINUTES.
//   2. Failing the check never blocks: the check is simply asked again (a network or an extension can make a person
//      fail it). The account is blocked only when automation is clear: a hidden trap touched (a link, a button or a
//      question no person can see), the check ignored while requests keep coming at a machine's pace, a hard line
//      crossed, or signs adding up to BLOCK_AT. Its sessions end, every request and the sign-in answer « blocked »,
//      the page asks the person to write to the admin on Telegram; the owner unblocks on the admin's person page.
//      The network it came from is strict for a few days (worker/networks.ts).
// Every sign and step is noted in guard_events and shown on that page with the score. The owner is never checked.
// Without a Turnstile site key (tests, this Mac) nothing is asked; the hard lines and the traps still block.
// Costs: nothing more is read than the session row (currentUser); counts live in this server's memory; a row is written
// only when something happens (a sign, a check, a block) and once a day a session (the invisible check passed).
import { type Env, json, nowIso, day, ipOf } from "./util.ts";
import { humanCheck, currentUser, type Me } from "./auth.ts";
import { isOwnerEmail } from "./access.ts";
import { markNetwork } from "./networks.ts";

/** the lines: per minute (Cloudflare's shared counters, wrangler.app.jsonc) and per day (counted here) */
export const GUARD = {
  // a person's pages ask a few requests at a time, an exam about five in all: 90 a minute is a machine
  minute: { soft: "USER_PACE (90)", hard: "USER_BURST (240)" },
  day: {
    requests: { soft: 2000, hard: 6000 },
    writes: { soft: 800, hard: 2500 },
    // different question-bank files (13 practice levels, 80 exams, the index): the whole bank is 94
    bank: { soft: 40, hard: 150 },
    // exams, simulator sessions and mock exams started (all of them in a day is about 100)
    starts: { soft: 60, hard: 200 },
  },
} as const;
export const HUMAN_MINUTES = 45;
const FLUSH_EVERY = 25;

/**
 * The signs, and what each adds to the account's score (each counts once, for SIGN_DAYS after it was last seen).
 * No sign a person can produce reaches BLOCK_AT alone, nor do all of those together: trouble with the check (it failed,
 * it never came, a failed answer: a network, an extension) counts CHECK_CAP at most, events no hand made (an
 * extension that clicks for you) 30, no hand at all 20. A block needs a machine's own mark besides (webdriver,
 * headless, an even beat), or a trap.
 */
export const SIGNS = {
  trap: { weight: 100, label: "touched a hidden trap" },
  canary: { weight: 100, label: "answered or opened a question no person can see" },
  webdriver: { weight: 40, label: "browser driven by a program (navigator.webdriver)" },
  headless: { weight: 40, label: "headless browser" },
  rhythm: { weight: 40, label: "answers at a machine's even beat" },
  untrusted: { weight: 30, label: "clicks or keys no hand made" },
  noinput: { weight: 20, label: "many changes, no mouse, touch or key at all" },
  quiet: { weight: 20, label: "Cloudflare's invisible check failed", check: true },
  nocheck: { weight: 30, label: "never answered Cloudflare's invisible check", check: true },
  failing: { weight: 20, label: "failed the human check again and again", check: true },
} as const satisfies Record<string, { weight: number; label: string; check?: boolean }>;
export type Sign = keyof typeof SIGNS;
export const ASK_AT = 40;
export const BLOCK_AT = 100;
const CHECK_CAP = 30;
const SIGN_DAYS = 7;
/** failed answers in a row before the « failing » sign */
const FAILING_AFTER = 3;
/** requests a session may make on a day before the invisible check must have come (the page sends it at once) */
export const QUIET_GRACE = 60;
/** even beat: at least this many answers in a row, their gaps varying less than this share of their mean (a person
 *  tapping to a metronome varies about 3–5 %; answering, far more), the mean at least MIN_GAP seconds */
export const RHYTHM = { answers: 30, cv: 0.02, minGap: 0.5 } as const;

export type GuardState = {
  humanUntil: string | null; humanNeededAt: string | null; humanFails: number;
  /** the signs seen in the last SIGN_DAYS: name → last seen */
  signs: Partial<Record<Sign, string>>;
  /** the app's day this session last passed the invisible check */
  checkedDay: string | null;
};
const fresh = (): GuardState => ({ humanUntil: null, humanNeededAt: null, humanFails: 0, signs: {}, checkedDay: null });
const stateOf = (me: Me) => (me.guard ??= fresh());

/** users.guard_signs as read: unknown names and signs older than SIGN_DAYS dropped */
export function parseSigns(text: string | null | undefined): GuardState["signs"] {
  if (!text) return {};
  const out: GuardState["signs"] = {};
  try {
    const cut = Date.now() - SIGN_DAYS * 86_400_000;
    for (const [k, v] of Object.entries(JSON.parse(text) as Record<string, unknown>)) {
      if (k in SIGNS && typeof v === "string" && Date.parse(v) > cut) out[k as Sign] = v;
    }
  } catch { /* none */ }
  return out;
}

/** the score of a set of signs: each once, the check's trouble together at most CHECK_CAP */
export function scoreOf(signs: GuardState["signs"]): number {
  let score = 0, check = 0;
  for (const k of Object.keys(signs) as Sign[]) {
    const s: { weight: number; check?: boolean } = SIGNS[k];
    if (s.check) check += s.weight; else score += s.weight;
  }
  return score + Math.min(CHECK_CAP, check);
}

const passed = (s: GuardState) => !!s.humanUntil && Date.parse(s.humanUntil) > Date.now();
/** passed today (in the app's day): the day's soft lines do not ask again */
const passedToday = (env: Env, s: GuardState) => !!s.humanUntil && day(env.APP_TZ, new Date(Date.parse(s.humanUntil) - HUMAN_MINUTES * 60_000)) === day(env.APP_TZ);
const pending = (s: GuardState) => !!s.humanNeededAt && !passed(s);

export async function note(env: Env, userId: string, kind: string, detail: string | null = null) {
  await env.DB.prepare("INSERT OR IGNORE INTO guard_events (user_id, at, kind, detail) VALUES (?, ?, ?, ?)").bind(userId, nowIso(), kind, detail?.slice(0, 300) ?? null).run();
}

export const blockedAnswer = () => json({ error: "blocked", contact: "https://t.me/tcfmonsteradmin" }, 403);
const askAnswer = (env: Env) => json({ error: "human", turnstile: env.TURNSTILE_SITEKEY ?? null }, 429);

/** block an account: marked, signed out everywhere, noted; `req` (a block by the guard) makes its network strict */
export async function blockUser(env: Env, userId: string, reason: string, req?: Request) {
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET blocked_at = ?, blocked_reason = ? WHERE id = ? AND blocked_at IS NULL").bind(nowIso(), reason.slice(0, 200), userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  ]);
  await note(env, userId, "blocked", reason);
  if (req) await markNetwork(env, req, "block").catch(() => {});
}

/** unblock (the owner): the mark, the counts, the signs and the pending check go; the person starts from zero */
export async function unblockUser(env: Env, userId: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET blocked_at = NULL, blocked_reason = NULL, human_fails = 0, human_needed_at = NULL, human_reason = NULL, guard_signs = NULL WHERE id = ?").bind(userId),
    env.DB.prepare("DELETE FROM bank_reads WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM usage WHERE user_id = ?").bind(userId),
  ]);
  await note(env, userId, "unblocked", "by the owner");
}

/** ask for the check (once: later requests find it pending in the account); `again`: new signs undo an earlier pass */
async function requireHuman(env: Env, me: Me, reason: string, again = false): Promise<Response> {
  const s = stateOf(me);
  const r = await env.DB.prepare(`UPDATE users SET human_needed_at = ?, human_reason = ?${again ? ", human_until = NULL" : ""} WHERE id = ? AND (human_needed_at IS NULL${again ? " OR human_until IS NOT NULL" : ""})`)
    .bind(nowIso(), reason.slice(0, 200), me.id).run();
  if (r.meta.changes) await note(env, me.id, "challenged", reason);
  s.humanNeededAt ??= nowIso();
  if (again) s.humanUntil = null;
  return askAnswer(env);
}

/** a soft line crossed: the check, unless passed now (or today, for the day's lines) */
async function soft(env: Env, me: Me, s: GuardState, reason: string, daily: boolean): Promise<Response | null> {
  if (passed(s) || (daily && passedToday(env, s)) || !env.TURNSTILE_SITEKEY) return null;
  return requireHuman(env, me, reason);
}

/**
 * New signs seen on an account: added to its signs (one row write, merged in the database: two servers at once lose
 * nothing), noted with the score, then decided — BLOCK_AT blocks, ASK_AT asks the check (even after a pass: this is
 * new). A sign already counted writes nothing. null = go on.
 */
export async function addSigns(env: Env, me: Me, req: Request | null, names: Sign[], detail: string | null = null): Promise<Response | null> {
  if (isOwnerEmail(env, me.email)) return null;
  const s = stateOf(me);
  const fresh = names.filter((n, i) => !s.signs[n] && names.indexOf(n) === i);
  if (!fresh.length) return null;
  const at = nowIso();
  const row = await env.DB.prepare("UPDATE users SET guard_signs = json_patch(coalesce(guard_signs, '{}'), ?) WHERE id = ? RETURNING guard_signs")
    .bind(JSON.stringify(Object.fromEntries(fresh.map((n) => [n, at]))), me.id).first<{ guard_signs: string | null }>();
  s.signs = { ...s.signs, ...parseSigns(row?.guard_signs) };
  for (const n of fresh) s.signs[n] ??= at;
  const score = scoreOf(s.signs);
  await note(env, me.id, "sign", `${fresh.join(", ")}${detail ? ` (${detail})` : ""} · score ${score}`);
  if (score >= BLOCK_AT) {
    const why = (Object.keys(s.signs) as Sign[]).sort((a, b) => SIGNS[b].weight - SIGNS[a].weight).map((n) => SIGNS[n].label);
    await blockUser(env, me.id, `automation: ${why.join("; ")}`, req ?? undefined);
    return blockedAnswer();
  }
  if (score >= ASK_AT && env.TURNSTILE_SITEKEY) return requireHuman(env, me, `signs of a machine: ${fresh.map((n) => SIGNS[n].label).join("; ")}`, true);
  return null;
}

/* ---------- hidden traps ---------- */

/** a page the browser fetches ahead by itself (prefetch, prerender, a link preview) is not a visit */
const prefetch = (req: Request) => /prefetch|prerender|preview/i.test(`${req.headers.get("sec-purpose") ?? ""} ${req.headers.get("purpose") ?? ""} ${req.headers.get("x-purpose") ?? ""} ${req.headers.get("x-moz") ?? ""}`);

/** the trap addresses: named only in markup no person can see or reach (web/app/index.html, site/index.html, the app's
 *  hidden button), never in robots.txt; /data/ is closed to crawlers there anyway */
export const TRAPS = new Set(["/data/bank-full.json", "/api/me/archive"]);

/** a hidden trap touched: a signed-in account is blocked (the owner never), a visitor's network goes strict for a day */
export async function trapped(env: Env, req: Request, what: string, who?: Me | null): Promise<Response> {
  const notFound = json({ error: "not found" }, 404);
  if (prefetch(req)) return notFound;
  const me = who === undefined ? await currentUser(env, req).catch(() => null) : who;
  if (!me) { await markNetwork(env, req, "trap").catch(() => {}); return notFound; }
  const stopped = await addSigns(env, me, req, [what.startsWith("canary") ? "canary" : "trap"], what);
  return stopped ?? notFound;
}

/* canaries: questions and recording names inside the bank's files that no page ever shows (scripts/copy-media.mjs puts
   them there at each build, with names made with this Mac's secret; their list lives in R2 private/canary.json) */
let canaryList: { ids: Set<string>; media: Set<string>; until: number } | null = null;
export const resetCanaries = () => { canaryList = null; };
async function canaries(env: Env) {
  if (canaryList && Date.now() < canaryList.until) return canaryList;
  let ids: string[] = [], media: string[] = [];
  let ok = false;
  try {
    const obj = await env.FILES.get("private/canary.json");
    if (obj) { const d = JSON.parse(await obj.text()) as { ids?: unknown; media?: unknown }; ids = Array.isArray(d.ids) ? d.ids.map(String) : []; media = Array.isArray(d.media) ? d.media.map(String) : []; }
    ok = true;
  } catch { /* asked again in a minute */ }
  // kept for this server's life once read (a deploy starts new servers); a failed read is tried again a minute later
  canaryList = { ids: new Set(ids), media: new Set(media), until: ok ? Infinity : Date.now() + 60_000 };
  return canaryList;
}
/** a question id no person can see */
export async function isCanaryId(env: Env, ids: Iterable<string>): Promise<string | null> {
  const list = await canaries(env);
  if (!list.ids.size) return null;
  for (const id of ids) if (list.ids.has(id)) return id;
  return null;
}
/** a recording or picture name no page ever plays or shows ("media/co/<hex>.mp3"); old export names are never asked */
export async function isCanaryMedia(env: Env, key: string): Promise<boolean> {
  if (!/^media\/(co|ce)\/[0-9a-f]{32}\.\w+$/.test(key)) return false;
  return (await canaries(env)).media.has(`/${key}`);
}
/** an exam answer for a position past 39: the exam files carry one question no page shows, at position 40 */
export const canaryPlacement = (placement: string) => /^C[OE]-\d{2}-4\d$/.test(placement);

/* ---------- even beat: answers in a row, timed by the browser ---------- */
const beats = new Map<string, number[]>();

/** practice answers' moments (seconds) for a person; past RHYTHM.answers in a row at a machine's even beat, a sign */
export async function noteBeat(env: Env, me: Me, req: Request, times: number[]): Promise<Response | null> {
  if (!times.length || isOwnerEmail(env, me.email) || stateOf(me).signs.rhythm) return null;
  const all = [...(beats.get(me.id) ?? []), ...times].sort((a, b) => a - b).filter((t, i, a) => i === 0 || t - a[i - 1] > 1e-6);
  const last = all.slice(-(RHYTHM.answers + 1));
  beats.set(me.id, last);
  if (beats.size > 5000) beats.clear();
  if (last.length <= RHYTHM.answers) return null;
  const gaps = last.slice(1).map((t, i) => t - last[i]);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  if (mean < RHYTHM.minGap || sd / mean >= RHYTHM.cv) return null;
  beats.delete(me.id);
  return addSigns(env, me, req, ["rhythm"], `${gaps.length} answers ${mean.toFixed(2)} s apart, ±${Math.round(sd * 1000)} ms`);
}

/* ---------- the browser's own clues, sent with the page's requests (web/app/signs.ts) ---------- */
const CLUES: Record<string, Sign> = { w: "webdriver", h: "headless", u: "untrusted", n: "noinput" };
function cluesOf(req: Request): Sign[] {
  const h = req.headers.get("x-signs");
  if (!h || h.length > 20) return [];
  return [...new Set(h.split(/[\s,]+/).map((c) => CLUES[c]).filter(Boolean))];
}

/* ---------- the day's volume, counted in this server's memory and written in groups ---------- */
const counts = new Map<string, { day: string; requests: number; writes: number }>();
/** requests a session made today without the invisible check */
const misses = new Map<string, number>();
export const resetGuardCounts = () => { counts.clear(); misses.clear(); beats.clear(); };

/** add this request; every FLUSH_EVERY the row is written and the day's totals come back */
async function countDay(env: Env, userId: string, write: boolean): Promise<{ requests: number; writes: number } | null> {
  const today = day(env.APP_TZ);
  let c = counts.get(userId);
  if (!c || c.day !== today) { c = { day: today, requests: 0, writes: 0 }; counts.set(userId, c); }
  c.requests++;
  if (write) c.writes++;
  if (c.requests < FLUSH_EVERY) return null;
  const add = { ...c };
  counts.delete(userId);
  if (counts.size > 5000) counts.clear();
  return env.DB.prepare(`INSERT INTO usage (user_id, day, requests, writes) VALUES (?, ?, ?, ?)
    ON CONFLICT(user_id, day) DO UPDATE SET requests = requests + excluded.requests, writes = writes + excluded.writes RETURNING requests, writes`)
    .bind(userId, today, add.requests, add.writes).first<{ requests: number; writes: number }>();
}

/** a daily amount past its lines (bank files, starts): the check, then the block */
export async function guardAmount(env: Env, me: Me, what: "bank" | "starts", n: number, req?: Request): Promise<Response | null> {
  if (isOwnerEmail(env, me.email)) return null;
  const line = GUARD.day[what];
  const label = what === "bank" ? "question-bank files" : "exams and sessions started";
  if (n > line.hard) { await blockUser(env, me.id, `more than ${line.hard} ${label} in a day`, req); return blockedAnswer(); }
  if (n > line.soft) return soft(env, me, stateOf(me), `more than ${line.soft} ${label} in a day`, true);
  return null;
}

/* ---------- the check's answers ---------- */

/** a pass: holds HUMAN_MINUTES, and counts as today's invisible check for this session */
async function pass(env: Env, me: Me, s: GuardState) {
  const until = new Date(Date.now() + HUMAN_MINUTES * 60_000).toISOString();
  const today = day(env.APP_TZ);
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET human_until = ?, human_needed_at = NULL, human_reason = NULL, human_fails = 0 WHERE id = ?").bind(until, me.id),
    env.DB.prepare("UPDATE sessions SET checked_day = ? WHERE id = ?").bind(today, me.sid),
  ]);
  Object.assign(s, { humanUntil: until, humanNeededAt: null, humanFails: 0, checkedDay: today });
  misses.delete(me.sid);
  await note(env, me.id, "passed");
}

/** the token a page brings back from the visible check: a pass holds; a refusal is noted and the check asked again —
 *  failing never blocks by itself (FAILING_AFTER in a row is a sign, worth CHECK_CAP at most with the others) */
async function answer(req: Request, env: Env, me: Me, s: GuardState): Promise<Response | null> {
  const token = req.headers.get("x-turnstile");
  if (!token) return askAnswer(env);
  const verdict = await humanCheck(env, token, ipOf(req), "human");
  if (verdict === "ok") { await pass(env, me, s); return null; }
  // Cloudflare could not be asked (a time-out, its own error): not the person's failure
  if (verdict === "unreachable") return askAnswer(env);
  // a token is good once: the other requests the page sent with it, at the same moment, find the pass already made
  const now = await env.DB.prepare("SELECT human_until FROM users WHERE id = ?").bind(me.id).first<{ human_until: string | null }>();
  if (now?.human_until && Date.parse(now.human_until) > Date.now()) { s.humanUntil = now.human_until; s.humanNeededAt = null; return null; }
  const r = await env.DB.prepare("UPDATE users SET human_fails = human_fails + 1, human_needed_at = coalesce(human_needed_at, ?) WHERE id = ? RETURNING human_fails").bind(nowIso(), me.id).first<{ human_fails: number }>();
  const fails = Number(r?.human_fails ?? s.humanFails + 1);
  s.humanFails = fails;
  s.humanNeededAt ??= nowIso();
  await note(env, me.id, "failed", `${fails} in a row; asked again`);
  if (fails >= FAILING_AFTER) { const stopped = await addSigns(env, me, req, ["failing"], `${fails} failed checks`); if (stopped) return stopped; }
  return askAnswer(env);
}

/** Cloudflare's invisible check, once a day a session: the page runs it when a response carries `x-quiet-check` and
 *  sends its token (or « failed ») as `x-quiet` with its next request. Its failure asks the visible check. */
async function quiet(req: Request, env: Env, me: Me, s: GuardState): Promise<Response | null> {
  if (!env.TURNSTILE_SITEKEY || s.checkedDay === day(env.APP_TZ) || passed(s)) return null;
  const token = req.headers.get("x-quiet");
  if (!token) {
    const n = (misses.get(me.sid) ?? 0) + 1;
    misses.set(me.sid, n);
    if (misses.size > 5000) misses.clear();
    me.askQuiet = true;
    // a page that runs our script sends it within its first requests; one that never does is not a browser
    if (n === QUIET_GRACE) return (await addSigns(env, me, req, ["nocheck"], `${n} requests`)) ?? requireHuman(env, me, "no answer to Cloudflare's invisible check");
    return null;
  }
  const verdict = token === "failed" ? "no" : await humanCheck(env, token, ipOf(req), "quiet");
  if (verdict === "ok") {
    const today = day(env.APP_TZ);
    await env.DB.prepare("UPDATE sessions SET checked_day = ? WHERE id = ?").bind(today, me.sid).run();
    s.checkedDay = today;
    misses.delete(me.sid);
    return null;
  }
  if (verdict === "unreachable") return null;
  return (await addSigns(env, me, req, ["quiet"], token === "failed" ? "the page could not run it" : "refused")) ?? requireHuman(env, me, "Cloudflare's invisible check failed");
}

/**
 * Every signed-in request (the API and the bank's files) passes here first. null = go on; otherwise the answer to
 * send back (the check asked, or the account blocked). `me.askQuiet` tells the caller to ask the page for the
 * invisible check (quietHeaders).
 */
export async function guardRequest(req: Request, env: Env, me: Me, write: boolean): Promise<Response | null> {
  if (isOwnerEmail(env, me.email)) return null;
  const s = stateOf(me);
  // every request counts toward the day, those refused too: ignoring the check does not stop the count
  const total = await countDay(env, me.id, write);
  if (total) {
    const L = GUARD.day;
    if (total.requests > L.requests.hard || total.writes > L.writes.hard) {
      await blockUser(env, me.id, total.requests > L.requests.hard ? `more than ${L.requests.hard} requests in a day` : `more than ${L.writes.hard} changes in a day`, req);
      return blockedAnswer();
    }
  }
  // the minute: Cloudflare's counters, shared by every server
  const burstOk = env.USER_BURST ? (await env.USER_BURST.limit({ key: me.id })).success : true;
  // still coming at a machine's pace while the check waits unanswered, or after it was passed: a program
  if (!burstOk && (pending(s) || passed(s) || !env.TURNSTILE_SITEKEY)) {
    await blockUser(env, me.id, pending(s) ? "kept going at a machine's pace without passing the human check" : "requests far faster than a person, after the human check", req);
    return blockedAnswer();
  }
  // the browser's own clues (webdriver, headless, events no hand made, no hand at all)
  const clues = cluesOf(req);
  if (clues.length) { const stopped = await addSigns(env, me, req, clues, "from the page"); if (stopped) return stopped; }
  // a check is pending: nothing goes on without its answer
  if (pending(s) || (req.headers.get("x-turnstile") && !passed(s))) {
    const refused = await answer(req, env, me, s);
    if (refused) return refused;
  }
  const asked = await quiet(req, env, me, s);
  if (asked) return asked;
  const paceOk = env.USER_PACE ? (await env.USER_PACE.limit({ key: me.id })).success : true;
  if (!burstOk || !paceOk) {
    const stopped = await soft(env, me, s, !burstOk ? "requests far faster than a person" : "requests faster than a person", false);
    if (stopped) return stopped;
  }
  if (total) {
    const L = GUARD.day;
    if (total.requests > L.requests.soft || total.writes > L.writes.soft) {
      const stopped = await soft(env, me, s, total.requests > L.requests.soft ? `more than ${L.requests.soft} requests in a day` : `more than ${L.writes.soft} changes in a day`, true);
      if (stopped) return stopped;
    }
  }
  return null;
}

/** the header that asks the page for today's invisible check (only while this session has not passed it) */
export const quietHeaders = (env: Env, me: Me): Record<string, string> => (me.askQuiet && env.TURNSTILE_SITEKEY ? { "x-quiet-check": env.TURNSTILE_SITEKEY } : {});
