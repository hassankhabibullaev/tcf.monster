// Accounts: an e-mail code proves the address (new account and forgotten password alike), then a password.
// Passwords are stretched in the browser (PBKDF2-SHA256, 210 000 rounds, salted with the e-mail, see web/app/api.ts);
// the server keeps only HMAC-SHA256(pepper, salt + that value). A stolen database alone gives nothing to test
// guesses against, and every guess costs the full stretch. The server's own work stays inside the free plan's 10 ms.
import { type Env, json, fail, nowIso, readJson, rateLimit, ipOf } from "./util.ts";
import { type GuardState, parseSigns } from "./guard.ts";
import { isOwnerEmail } from "./access.ts";
import { sendDesigned, sentToday, dayTotal, alertOwner } from "./mail.ts";
import { networkState, markNetwork } from "./networks.ts";

export const SESSION_COOKIE = "tcfm_session";
const SESSION_DAYS = 30;
/** a sign-in ends this long after it started, used or not (the owner's, which opens the admin, sooner) */
const SESSION_MAX_DAYS = 90;
const OWNER_SESSION_MAX_DAYS = 14;
const CODE_MINUTES = 5;
const CODE_TRIES = 5;
/** the first code and two more an hour (the page offers « Renvoyer le code » after a minute, twice) */
const CODES_PER_HOUR = 3;
const RESEND_SECONDS = 60;
/** codes sent for one network (a keyed hash of its address) in a day, whatever the addresses asked for; a network a
 *  bot was caught on lately (worker/networks.ts) gets fewer */
const NET_CODES_PER_DAY = 15;
const STRICT_NET_CODES_PER_DAY = 5;
/** codes a day for one address: at most 50 guesses a day at any account (each code allows 5) */
const CODES_PER_DAY = 10;
const LOGIN_FAILS = 10;
const LOCK_MINUTES = 15;
/** one address a minute: codes asked (whatever the e-mails: no mail bombing from here), passwords and codes tried */
const IP_CODES_PER_MIN = 10;
const IP_TRIES_PER_MIN = 30;

// ---- small crypto ----
const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
export function randomToken(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
const randomCode = () => String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
}
/** same length strings compared without an early exit */
export function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
/** the server's secret for passwords and stop links: missing, nothing is stored or checked (fails closed), except on
 *  this Mac (scripts/local-env.ts sets LOCAL_DEV) */
export function pepper(env: Env) {
  if (env.PASSWORD_PEPPER) return env.PASSWORD_PEPPER;
  if (env.LOCAL_DEV === "1") return "dev-pepper-not-for-production";
  throw new Error("PASSWORD_PEPPER is not set");
}
async function hashPassword(env: Env, stretched: string) {
  const salt = randomToken(16);
  return `hmac-sha256$${salt}$${await hmac(pepper(env), salt + stretched)}`;
}
async function checkPassword(env: Env, stored: string, stretched: string) {
  const [kind, salt, h] = stored.split("$");
  return kind === "hmac-sha256" && same(h, await hmac(pepper(env), salt + stretched));
}

const DUMMY_HASH = "hmac-sha256$0000000000000000000000$0";

/** the part of an address that names one network: an IPv4 address whole, an IPv6 address by its first 64 bits (one
 *  home or one phone gets a whole /64, and a script can walk through it) */
export function netPart(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.toLowerCase().split("%")[0].split("::");
  const left = head ? head.split(":") : [];
  const right = ip.includes("::") && tail ? tail.split(":") : [];
  const groups = ip.includes("::") ? [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right] : left;
  return groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

/** the visitor's network as a keyed hash (never the address itself, which is personal data): mail counts per network,
 *  the networks a bot was caught on (worker/networks.ts) */
export async function networkOf(env: Env, req: Request): Promise<string | null> {
  const ip = ipOf(req);
  return ip ? (await hmac(pepper(env), `net:${netPart(ip)}`)).slice(0, 20) : null;
}

/** an address the mail services take: no dot at either end of a part, no two dots in a row (« name.@example.com », a
 *  typo they refuse, once got « code sent » and no mail) */
export const cleanEmail = (v: unknown) => {
  const e = String(v ?? "").trim().toLowerCase();
  return e.length <= 200 && /^[^\s@.]([^\s@]*[^\s@.])?@[^\s@.-][^\s@]*\.[^\s@.]+$/.test(e) && !e.includes("..") ? e : null;
};
/** the stretched password as the browser sends it: 43 base64url characters */
const cleanStretched = (v: unknown) => (typeof v === "string" && /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null);

/** who may create an account: everyone once APP_OPEN is "1"; before that the owner and the testers */
export function mayJoin(env: Env, email: string) {
  if (env.APP_OPEN === "1") return true;
  const allowed = [env.OWNER_EMAIL, ...(env.TESTERS ?? "").split(",")].map((x) => x.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email);
}

// ---- sessions ----
function deviceOf(ua: string) {
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "Device";
  const br = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  return `${os} · ${br}`;
}

/** the sign-in cookie, shared by tcf.monster and admin.tcf.monster (Domain=tcf.monster covers both) */
export function sessionCookie(req: Request, value: string, maxAge: number) {
  const host = new URL(req.url).hostname;
  const domain = host.endsWith("tcf.monster") ? "; Domain=tcf.monster" : "";
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${domain}${secure}`;
}

async function startSession(env: Env, req: Request, userId: string) {
  const token = randomToken();
  const now = nowIso(), exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, device) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await sha256(token), userId, now, now, exp, deviceOf(req.headers.get("user-agent") ?? "")),
    env.DB.prepare("UPDATE users SET last_seen_at = ?, failed_logins = 0, locked_until = NULL WHERE id = ?").bind(now, userId),
  ]);
  return sessionCookie(req, token, SESSION_DAYS * 86400);
}

/** the signed-in person; `guard`: where the abuse guard stands with them (worker/guard.ts), read with the session */
export type Me = { id: string; email: string; sid: string; guard?: GuardState; /** the guard wants the page to run today's invisible check */ askQuiet?: boolean };
const tokenOf = (req: Request) => (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))?.[1];

/** the signed-in person, or null. The first visit of a day moves the 30 days forward (once a day, not once an hour:
 *  the free plan counts every row written). */
export async function currentUser(env: Env, req: Request): Promise<Me | null> {
  const token = tokenOf(req);
  if (!token) return null;
  const sid = await sha256(token);
  // a blocked account has no sessions (blocking ends them); the condition keeps it out even if one survived
  const r = await env.DB.prepare(`SELECT s.user_id, s.last_seen_at, s.created_at, s.checked_day, u.email, u.human_until, u.human_needed_at, u.human_fails, u.guard_signs
    FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ? AND u.blocked_at IS NULL`)
    .bind(sid, nowIso()).first<{ user_id: string; last_seen_at: string; created_at: string; checked_day: string | null; email: string; human_until: string | null; human_needed_at: string | null; human_fails: number | null; guard_signs: string | null }>();
  if (!r) return null;
  const maxDays = isOwnerEmail(env, r.email) ? OWNER_SESSION_MAX_DAYS : SESSION_MAX_DAYS;
  if (Date.now() - Date.parse(r.created_at) > maxDays * 86_400_000) {
    await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(sid).run();
    return null;
  }
  if (Date.now() - Date.parse(r.last_seen_at) > 86_400_000) {
    const now = nowIso(), exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?").bind(now, exp, sid),
      env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, r.user_id),
    ]);
  }
  return { id: r.user_id, email: r.email, sid, guard: { humanUntil: r.human_until, humanNeededAt: r.human_needed_at, humanFails: Number(r.human_fails ?? 0), signs: parseSigns(r.guard_signs), checkedDay: r.checked_day } };
}

// ---- codes ----
type CodeRow = { code_hash: string; created_at: string; expires_at: string; tries: number; proof_hash: string | null; sends: number; window_at: string | null; day_sends: number | null; day_at: string | null };

/** send a 6-digit code; refuses politely when asked too often. `mail` is which of the four code mails carries it (the
 *  sign-up, sign-in and new-password codes share the "email" purpose: one code proves the address for all three) */
export async function sendCode(env: Env, email: string, purpose: "email" | "delete", lang: string, mail: "signup" | "signin" | "password" | "delete" = purpose === "delete" ? "delete" : "signin", net: string | null = null, strict = false) {
  // one network, any addresses: at most NET_CODES_PER_DAY codes a day (a script cannot spend the day's mails)
  if (net) {
    const sent = await env.DB.prepare("SELECT COUNT(*) n FROM mail WHERE ip = ? AND at >= ?").bind(net, new Date(Date.now() - 86_400_000).toISOString()).first<{ n: number }>();
    if (Number(sent?.n ?? 0) >= (strict ? STRICT_NET_CODES_PER_DAY : NET_CODES_PER_DAY)) return { error: "too_many" };
  }
  const row = await env.DB.prepare("SELECT * FROM codes WHERE email = ? AND purpose = ?").bind(email, purpose).first<CodeRow>();
  const now = Date.now();
  if (row && now - Date.parse(row.created_at) < RESEND_SECONDS * 1000) return { error: "wait", wait: Math.ceil((RESEND_SECONDS * 1000 - (now - Date.parse(row.created_at))) / 1000) };
  const inWindow = row?.window_at && now - Date.parse(row.window_at) < 3600000;
  const sends = inWindow ? row!.sends + 1 : 1;
  if (sends > CODES_PER_HOUR) return { error: "too_many" };
  const inDay = row?.day_at && now - Date.parse(row.day_at) < 86_400_000;
  const daySends = inDay ? (row!.day_sends ?? 0) + 1 : 1;
  if (daySends > CODES_PER_DAY) return { error: "too_many" };
  const code = randomCode();
  const at = nowIso();
  await env.DB.prepare(`INSERT INTO codes (email, purpose, code_hash, created_at, expires_at, tries, proof_hash, sends, window_at, day_sends, day_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL, ?6, ?7, ?8, ?9)
    ON CONFLICT(email, purpose) DO UPDATE SET code_hash = ?3, created_at = ?4, expires_at = ?5, tries = 0, proof_hash = NULL, sends = ?6, window_at = ?7, day_sends = ?8, day_at = ?9`)
    .bind(email, purpose, await sha256(`${email}:${code}`), at, new Date(now + CODE_MINUTES * 60000).toISOString(), sends, inWindow ? row!.window_at : at, daySends, inDay ? row!.day_at : at).run();
  const sent = await sendDesigned(env, email, mail, { lang, code, net });
  if (!sent.ok) await alertOwner(env).catch(() => {});
  return sent.ok ? { ok: true } : { error: "mail" };
}

/** check a code; a right one becomes a proof (returned once) good until the code would have expired. The try is
 *  counted before the code is compared, in one statement: guesses sent all at once still get five tries in all. */
export async function checkCode(env: Env, email: string, purpose: "email" | "delete", code: string) {
  const row = await env.DB.prepare("UPDATE codes SET tries = tries + 1 WHERE email = ? AND purpose = ? AND tries < ? AND expires_at >= ? RETURNING code_hash, tries")
    .bind(email, purpose, CODE_TRIES, nowIso()).first<{ code_hash: string; tries: number }>();
  if (!row) return { error: "expired" as const };
  if (!/^\d{6}$/.test(code) || !same(row.code_hash, await sha256(`${email}:${code}`))) {
    return { error: row.tries >= CODE_TRIES ? ("expired" as const) : ("wrong" as const), left: CODE_TRIES - row.tries };
  }
  const proof = randomToken();
  await env.DB.prepare("UPDATE codes SET proof_hash = ?, tries = ? WHERE email = ? AND purpose = ?").bind(await sha256(proof), CODE_TRIES, email, purpose).run();
  return { proof };
}

/** a proof is spent by deleting its row: two requests with the same proof at once, only one finds it */
async function useProof(env: Env, email: string, purpose: "email" | "delete", proof: string) {
  const gone = await env.DB.prepare("DELETE FROM codes WHERE email = ? AND purpose = ? AND proof_hash = ? AND expires_at >= ? RETURNING email")
    .bind(email, purpose, await sha256(proof), nowIso()).first();
  return gone !== null;
}

// ---- sign-ups: the e-mail quota is shared by everyone, so new addresses may not use it all ----
/** sign-up codes, whole site: at most this many an hour, and none once today's mails reach the day's limit minus a
 *  reserve; people who already have an account (sign-in, new password, deletion) always keep the reserve */
const SIGNUP_CODES_PER_HOUR = 30;
/** codes for existing accounts (sign-in, new password), whole site: a script cannot spend the day's e-mails on them */
const ACCOUNT_CODES_PER_HOUR = 60;
export async function accountRoom(env: Env) {
  const hour = await env.DB.prepare("SELECT COUNT(*) n FROM mail WHERE kind IN ('signin', 'reset', 'delete') AND at >= ?").bind(new Date(Date.now() - 3600000).toISOString()).first<{ n: number }>();
  return Number(hour?.n ?? 0) < ACCOUNT_CODES_PER_HOUR;
}
const ACCOUNT_RESERVE = 15;
async function signupRoom(env: Env) {
  const day = (await dayTotal(env)) - ACCOUNT_RESERVE;
  if ((await sentToday(env)) >= day) return false;
  const hour = await env.DB.prepare("SELECT COUNT(*) n FROM mail WHERE kind = 'signup' AND at >= ?").bind(new Date(Date.now() - 3600000).toISOString()).first<{ n: number }>();
  return Number(hour?.n ?? 0) < SIGNUP_CODES_PER_HOUR;
}

/** Turnstile (Cloudflare's free bot check) on the door: the e-mail step, every code sent and every password tried, once TURNSTILE_SITEKEY and the TURNSTILE_SECRET secret are
 *  set; the answer must be for this action and one of our own addresses. Fails closed. */
export async function humanOk(env: Env, token: unknown, ip: string | null, action = "signup") {
  return (await humanCheck(env, token, ip, action)) === "ok";
}

/** the same, telling a refusal (« no »: not a person, or a token for something else) from Cloudflare out of reach */
export async function humanCheck(env: Env, token: unknown, ip: string | null, action: string): Promise<"ok" | "no" | "unreachable"> {
  // off only where nothing is configured (tests, this Mac); a site key without its secret refuses everyone
  if (!env.TURNSTILE_SITEKEY) return "ok";
  if (!env.TURNSTILE_SECRET) return env.LOCAL_DEV === "1" ? "ok" : "no";
  if (typeof token !== "string" || !token || token.length > 2048) return "no";
  const hosts = new Set((env.TURNSTILE_HOSTNAMES ?? "tcf.monster").split(",").map((h) => h.trim()).filter(Boolean));
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return "unreachable";
    const d = (await r.json()) as { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] };
    if (!d.success) console.log(`[turnstile] refused: ${(d["error-codes"] ?? []).join(",") || "no reason"}`);
    // Cloudflare's own trouble is not the person's failure
    if (!d.success && (d["error-codes"] ?? []).includes("internal-error")) return "unreachable";
    return d.success === true && d.action === action && hosts.has(String(d.hostname)) ? "ok" : "no";
  } catch { return "unreachable"; }
}

// ---- the API ----
type Body = Record<string, unknown>;
export const TERMS_VERSION = "3"; // 2026-10-24: the key, the texts and the recordings stay on the device (2026-10-22: donations are contributions)

export async function handleAuth(req: Request, env: Env, path: string): Promise<Response> {
  if (req.method !== "POST") return fail(405, "POST");
  const b = (await readJson<Body>(req)) ?? {};
  // one address hammering: the lock per account above does not stop guesses spread over many accounts, nor codes
  // sent to many addresses (on this Mac there is no address, so no limit)
  const ip = ipOf(req);
  // a network a bot was caught on lately (worker/networks.ts): the check at every step, half the limits; one
  // with several blocked accounts takes no new account for a while (one row read, the door's requests only)
  const net = path === "/auth/logout" ? null : await networkOf(env, req);
  const ns = await networkState(env, net);
  // the door's hidden field (a person never sees it; a script filling every field does): its network goes strict
  if (typeof b.hp === "string" && b.hp) { await markNetwork(env, req, "trap").catch(() => {}); ns.strict = true; }
  const hammering = (what: string, limit: number) => ip !== null && !rateLimit(`${what}:${ip}`, ns.strict ? Math.ceil(limit / 2) : limit);
  // the same address on every Cloudflare server at once (the memory limit above is one server's): 20 a minute
  if (ip && env.AUTH_LIMIT && path !== "/auth/logout" && !(await env.AUTH_LIMIT.limit({ key: ip })).success) return json({ error: "too_many" }, 429);
  /** no bot check passed: the page asks Cloudflare for one (the public key rides along) and sends again; `strict`
   *  tells it to show the box rather than wait for Cloudflare to want a click */
  const notHuman = async (action: string) => ((await humanOk(env, b.turnstile, ip, action)) ? null : json({ error: "bot", turnstile: env.TURNSTILE_SITEKEY, ...(ns.strict ? { strict: true } : {}) }, 403));
  /** the steps that need no check elsewhere need one on a strict network */
  const strictCheck = async () => (ns.strict ? notHuman("strict") : null);
  /** no new account from a network with several blocked accounts, for a few days */
  const paused = () => json({ error: "paused", contact: "https://t.me/tcfmonsteradmin" }, 403);

  if (path === "/auth/exists") {
    // the one door asks the e-mail first and then shows the right next step: this tells it which one. It says
    // whether an address has an account (the owner chose this behaviour over a blind form); the same per-address
    // limit as the codes keeps it from being a list checker, and a closed door answers before anything is told
    const email = cleanEmail(b.email);
    if (!email) return fail(400, "email");
    if (hammering("code", IP_CODES_PER_MIN)) return json({ error: "too_many" }, 429);
    // a bot check first: a script cannot run a list of addresses through it
    const bot = await notHuman("door");
    if (bot) return bot;
    const u = await env.DB.prepare("SELECT password IS NOT NULL has FROM users WHERE email = ?").bind(email).first<{ has: number }>();
    const exists = Boolean(u?.has);
    if (!exists && !mayJoin(env, email)) return json({ error: "closed" }, 403);
    if (!exists && ns.closed) return paused();
    return json({ exists, ...(ns.strict ? { strict: true } : {}) });
  }

  if (path === "/auth/code") {
    const email = cleanEmail(b.email);
    if (!email) return fail(400, "email");
    if (hammering("code", IP_CODES_PER_MIN)) return json({ error: "too_many" }, 429);
    // a new account needs the door to be open; a forgotten password works for anyone who has an account
    const exists = await env.DB.prepare("SELECT password IS NOT NULL has FROM users WHERE email = ?").bind(email).first<{ has: number }>();
    if (!exists?.has && !mayJoin(env, email)) return json({ error: "closed" }, 403);
    if (!exists?.has && ns.closed) return paused();
    // every code needs a bot check (no mail bombing, no endless guessing): the same answer for any address
    const bot = await notHuman("code");
    if (bot) return bot;
    if (!(await (exists?.has ? accountRoom(env) : signupRoom(env)))) return json({ error: "busy" }, 429);
    // which mail: no account yet is a sign-up; the page says whether an existing one signs in or sets a new password
    const mail = !exists?.has ? "signup" : b.why === "reset" || b.why === "password" ? "password" : "signin";
    const r = await sendCode(env, email, "email", b.lang === "fr" ? "fr" : "en", mail, net, ns.strict);
    return json(r, "error" in r ? (r.error === "mail" ? 502 : 429) : 200);
  }

  if (path === "/auth/signin-code") {
    // sign-in by the code alone (« send me a code instead »): the code proves the address, the account must exist
    const email = cleanEmail(b.email);
    if (!email) return fail(400, "email");
    if (hammering("try", IP_TRIES_PER_MIN)) return json({ error: "too_many" }, 429);
    const bot = await strictCheck();
    if (bot) return bot;
    const u = await env.DB.prepare("SELECT id, blocked_at FROM users WHERE email = ? AND password IS NOT NULL").bind(email).first<{ id: string; blocked_at: string | null }>();
    // no account answers like an address with no code waiting (nothing tells the two apart)
    if (!u) return json({ error: "expired" }, 400);
    const r = await checkCode(env, email, "email", String(b.code ?? ""));
    if ("error" in r) return json(r, 400);
    if (u.blocked_at) return json({ error: "blocked" }, 403);
    await env.DB.prepare("DELETE FROM codes WHERE email = ? AND purpose = 'email'").bind(email).run();
    await env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(u.id).run();
    return json({ ok: true }, 200, { "set-cookie": await startSession(env, req, u.id) });
  }

  if (path === "/auth/verify") {
    const email = cleanEmail(b.email);
    if (!email) return fail(400, "email");
    if (hammering("try", IP_TRIES_PER_MIN)) return json({ error: "too_many" }, 429);
    const bot = await strictCheck();
    if (bot) return bot;
    const r = await checkCode(env, email, "email", String(b.code ?? ""));
    if ("error" in r) return json(r, 400);
    const u = await env.DB.prepare("SELECT password IS NOT NULL has FROM users WHERE email = ?").bind(email).first<{ has: number }>();
    return json({ proof: r.proof, exists: Boolean(u?.has) });
  }

  if (path === "/auth/password") {
    // new account (terms ticked) or a new password for an existing one, after a verified code
    const email = cleanEmail(b.email), pw = cleanStretched(b.password), proof = String(b.proof ?? "");
    if (!email || !pw || !proof) return fail(400, "fields");
    const bot = await strictCheck();
    if (bot) return bot;
    if (!(await useProof(env, email, "email", proof))) return json({ error: "expired" }, 400);
    const u = await env.DB.prepare("SELECT id, blocked_at FROM users WHERE email = ?").bind(email).first<{ id: string; blocked_at: string | null }>();
    if (u?.blocked_at) return json({ error: "blocked" }, 403);
    const hash = await hashPassword(env, pw);
    let id = u?.id;
    if (id) {
      // a new password signs every other device out
      await env.DB.batch([
        env.DB.prepare("UPDATE users SET password = ?, failed_logins = 0, locked_until = NULL WHERE id = ?").bind(hash, id),
        env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(id),
      ]);
    } else {
      if (b.terms !== true) return fail(400, "terms");
      if (!mayJoin(env, email)) return json({ error: "closed" }, 403);
      if (ns.closed) return paused();
      id = randomToken(12);
      const lang = b.lang === "fr" ? "fr" : "en";
      await env.DB.prepare("INSERT INTO users (id, email, password, created_at, lang, terms_version, terms_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, email, hash, nowIso(), lang, TERMS_VERSION, nowIso()).run();
    }
    return json({ ok: true, created: !u }, 200, { "set-cookie": await startSession(env, req, id) });
  }

  if (path === "/auth/login") {
    const email = cleanEmail(b.email), pw = cleanStretched(b.password);
    if (!email || !pw) return json({ error: "wrong" }, 400);
    if (hammering("try", IP_TRIES_PER_MIN)) return json({ error: "too_many" }, 429);
    // every password tried passes a bot check: no scripted guessing, and nobody locks another person out by script
    const bot = await notHuman("login");
    if (bot) return bot;
    const u = await env.DB.prepare("SELECT id, password, failed_logins, locked_until, blocked_at FROM users WHERE email = ?").bind(email)
      .first<{ id: string; password: string | null; failed_logins: number; locked_until: string | null; blocked_at: string | null }>();
    if (u?.locked_until && Date.parse(u.locked_until) > Date.now()) return json({ error: "locked", until: u.locked_until }, 429);
    // an unknown address costs the same work as a wrong password (the time does not tell them apart)
    const ok = await checkPassword(env, u?.password ?? DUMMY_HASH, pw);
    if (!u?.password || !ok) {
      if (u) {
        // counted in the database itself: guesses sent all at once each count
        const n = await env.DB.prepare("UPDATE users SET failed_logins = failed_logins + 1 WHERE id = ? RETURNING failed_logins").bind(u.id).first<{ failed_logins: number }>();
        const fails = Number(n?.failed_logins ?? u.failed_logins + 1);
        const lock = fails >= LOGIN_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
        if (lock) await env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?").bind(lock, u.id).run();
        if (lock) return json({ error: "locked", until: lock }, 429);
      }
      return json({ error: "wrong" }, 400);
    }
    // only after the right password: « blocked » tells nothing to someone who does not know it
    if (u.blocked_at) return json({ error: "blocked" }, 403);
    return json({ ok: true }, 200, { "set-cookie": await startSession(env, req, u.id) });
  }

  if (path === "/auth/logout") {
    const token = tokenOf(req);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) });
  }

  return fail(404, "not found");
}
