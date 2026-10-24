// The guard against abuse. tcf.monster is free and volunteer-run, on Cloudflare's free plan: one script can use up
// the day's requests, writes or mails for everyone. Nobody has a quota: a person may sit every exam in a day. What is
// watched is what no person does — a pace or a daily volume far beyond anyone studying:
//   1. past a soft line, the account must pass Cloudflare's human check (Turnstile) before going on; a pass holds
//      HUMAN_MINUTES, and the soft lines of the day do not ask again once passed today;
//   2. past a hard line (still going, check passed or ignored), or after HUMAN_FAILS failed checks, the account is
//      blocked: its sessions end, every request and the sign-in answer « blocked », and the page asks the person to
//      write to the admin on Telegram. The owner unblocks it on the admin's person page.
// Every step is noted in guard_events and shown on that page. The owner is never checked. Without a Turnstile site
// key (tests, this Mac) nothing is asked; the hard lines still block.
import { type Env, json, nowIso, day, ipOf } from "./util.ts";
import { humanCheck, type Me } from "./auth.ts";
import { isOwnerEmail } from "./access.ts";

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
export const HUMAN_FAILS = 5;
const FLUSH_EVERY = 25;

export type GuardState = { humanUntil: string | null; humanNeededAt: string | null; humanFails: number };
const passed = (s: GuardState) => !!s.humanUntil && Date.parse(s.humanUntil) > Date.now();
/** passed today (in the app's day): the day's soft lines do not ask again */
const passedToday = (env: Env, s: GuardState) => !!s.humanUntil && day(env.APP_TZ, new Date(Date.parse(s.humanUntil) - HUMAN_MINUTES * 60_000)) === day(env.APP_TZ);

export async function note(env: Env, userId: string, kind: string, detail: string | null = null) {
  await env.DB.prepare("INSERT OR IGNORE INTO guard_events (user_id, at, kind, detail) VALUES (?, ?, ?, ?)").bind(userId, nowIso(), kind, detail?.slice(0, 300) ?? null).run();
}

export const blockedAnswer = () => json({ error: "blocked", contact: "https://t.me/tcfmonsteradmin" }, 403);
const askAnswer = (env: Env) => json({ error: "human", turnstile: env.TURNSTILE_SITEKEY ?? null }, 429);

/** block an account: marked, signed out everywhere, noted */
export async function blockUser(env: Env, userId: string, reason: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET blocked_at = ?, blocked_reason = ? WHERE id = ? AND blocked_at IS NULL").bind(nowIso(), reason.slice(0, 200), userId),
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(userId),
  ]);
  await note(env, userId, "blocked", reason);
}

/** unblock (the owner): the mark, the counts and the pending check go; the person starts from zero */
export async function unblockUser(env: Env, userId: string) {
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET blocked_at = NULL, blocked_reason = NULL, human_fails = 0, human_needed_at = NULL, human_reason = NULL WHERE id = ?").bind(userId),
    env.DB.prepare("DELETE FROM bank_reads WHERE user_id = ?").bind(userId),
    env.DB.prepare("DELETE FROM usage WHERE user_id = ?").bind(userId),
  ]);
  await note(env, userId, "unblocked", "by the owner");
}

/** ask for the check (once: later requests find it pending in the account) */
async function requireHuman(env: Env, me: Me, reason: string): Promise<Response> {
  const r = await env.DB.prepare("UPDATE users SET human_needed_at = ?, human_reason = ? WHERE id = ? AND human_needed_at IS NULL").bind(nowIso(), reason.slice(0, 200), me.id).run();
  if (r.meta.changes) await note(env, me.id, "challenged", reason);
  return askAnswer(env);
}

/** a soft line crossed: the check, unless passed now (or today, for the day's lines) */
async function soft(env: Env, me: Me, s: GuardState, reason: string, daily: boolean): Promise<Response | null> {
  if (passed(s) || (daily && passedToday(env, s)) || !env.TURNSTILE_SITEKEY) return null;
  return requireHuman(env, me, reason);
}

/** the token a page brings back from the check: a pass holds HUMAN_MINUTES; a refusal counts, five block */
async function answer(req: Request, env: Env, me: Me, s: GuardState): Promise<Response | null> {
  const token = req.headers.get("x-turnstile");
  if (!token) return askAnswer(env);
  const verdict = await humanCheck(env, token, ipOf(req), "human");
  if (verdict === "ok") {
    const until = new Date(Date.now() + HUMAN_MINUTES * 60_000).toISOString();
    await env.DB.prepare("UPDATE users SET human_until = ?, human_needed_at = NULL, human_reason = NULL, human_fails = 0 WHERE id = ?").bind(until, me.id).run();
    s.humanUntil = until; s.humanNeededAt = null; s.humanFails = 0;
    await note(env, me.id, "passed");
    return null;
  }
  // Cloudflare could not be asked (a time-out, its own error): not the person's failure
  if (verdict === "unreachable") return askAnswer(env);
  // a token is good once: the other requests the page sent with it, at the same moment, find the pass already made
  const now = await env.DB.prepare("SELECT human_until FROM users WHERE id = ?").bind(me.id).first<{ human_until: string | null }>();
  if (now?.human_until && Date.parse(now.human_until) > Date.now()) { s.humanUntil = now.human_until; s.humanNeededAt = null; return null; }
  const fails = s.humanFails + 1;
  await note(env, me.id, "failed", `${fails} of ${HUMAN_FAILS}`);
  if (fails >= HUMAN_FAILS) { await blockUser(env, me.id, `${HUMAN_FAILS} failed human checks`); return blockedAnswer(); }
  await env.DB.prepare("UPDATE users SET human_fails = ? WHERE id = ?").bind(fails, me.id).run();
  return askAnswer(env);
}

/* ---------- the day's volume, counted in this server's memory and written in groups ---------- */
const counts = new Map<string, { day: string; requests: number; writes: number }>();
export const resetGuardCounts = () => counts.clear();

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
export async function guardAmount(env: Env, me: Me, what: "bank" | "starts", n: number): Promise<Response | null> {
  if (isOwnerEmail(env, me.email)) return null;
  const line = GUARD.day[what];
  const label = what === "bank" ? "question-bank files" : "exams and sessions started";
  if (n > line.hard) { await blockUser(env, me.id, `more than ${line.hard} ${label} in a day`); return blockedAnswer(); }
  if (n > line.soft) return soft(env, me, me.guard ?? { humanUntil: null, humanNeededAt: null, humanFails: 0 }, `more than ${line.soft} ${label} in a day`, true);
  return null;
}

/**
 * Every signed-in request (the API and the bank's files) passes here first. null = go on; otherwise the answer to
 * send back (the check asked, or the account blocked).
 */
export async function guardRequest(req: Request, env: Env, me: Me, write: boolean): Promise<Response | null> {
  if (isOwnerEmail(env, me.email)) return null;
  const s: GuardState = me.guard ?? { humanUntil: null, humanNeededAt: null, humanFails: 0 };
  // a check is pending: nothing goes on without its answer
  if (s.humanNeededAt && !passed(s)) {
    const refused = await answer(req, env, me, s);
    if (refused) return refused;
  } else if (req.headers.get("x-turnstile") && !passed(s)) {
    // a page that already had a token for this request (the check was asked just before)
    const refused = await answer(req, env, me, s);
    if (refused) return refused;
  }
  // the minute: Cloudflare's counters, shared by every server
  const burstOk = env.USER_BURST ? (await env.USER_BURST.limit({ key: me.id })).success : true;
  const paceOk = env.USER_PACE ? (await env.USER_PACE.limit({ key: me.id })).success : true;
  if (!burstOk && (passed(s) || !env.TURNSTILE_SITEKEY)) { await blockUser(env, me.id, "requests far faster than a person, after the human check"); return blockedAnswer(); }
  if (!burstOk || !paceOk) {
    const asked = await soft(env, me, s, !burstOk ? "requests far faster than a person" : "requests faster than a person", false);
    if (asked) return asked;
  }
  // the day
  const total = await countDay(env, me.id, write);
  if (total) {
    const L = GUARD.day;
    if (total.requests > L.requests.hard || total.writes > L.writes.hard) {
      await blockUser(env, me.id, total.requests > L.requests.hard ? `more than ${L.requests.hard} requests in a day` : `more than ${L.writes.hard} changes in a day`);
      return blockedAnswer();
    }
    if (total.requests > L.requests.soft || total.writes > L.writes.soft) {
      const asked = await soft(env, me, s, total.requests > L.requests.soft ? `more than ${L.requests.soft} requests in a day` : `more than ${L.writes.soft} changes in a day`, true);
      if (asked) return asked;
    }
  }
  return null;
}
