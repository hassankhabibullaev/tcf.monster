// Accounts: an e-mail code proves the address (new account and forgotten password alike), then a password.
// Passwords are stretched in the browser (PBKDF2-SHA256, 210 000 rounds, salted with the e-mail, see web/app/api.ts);
// the server keeps only HMAC-SHA256(pepper, salt + that value). A stolen database alone gives nothing to test
// guesses against, and every guess costs the full stretch. The server's own work stays inside the free plan's 10 ms.
import { type Env, json, fail, nowIso, readJson, rateLimit, ipOf } from "./util.ts";
import { sendDesigned, sentToday, dayTotal } from "./mail.ts";

export const SESSION_COOKIE = "tcfm_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 5;
const CODE_TRIES = 5;
const CODES_PER_HOUR = 5;
const RESEND_SECONDS = 30;
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
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
const pepper = (env: Env) => env.PASSWORD_PEPPER || "dev-pepper-not-for-production";
async function hashPassword(env: Env, stretched: string) {
  const salt = randomToken(16);
  return `hmac-sha256$${salt}$${await hmac(pepper(env), salt + stretched)}`;
}
async function checkPassword(env: Env, stored: string, stretched: string) {
  const [kind, salt, h] = stored.split("$");
  return kind === "hmac-sha256" && same(h, await hmac(pepper(env), salt + stretched));
}

export const cleanEmail = (v: unknown) => {
  const e = String(v ?? "").trim().toLowerCase();
  return e.length <= 200 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
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

export type Me = { id: string; email: string; sid: string };
const tokenOf = (req: Request) => (req.headers.get("cookie") ?? "").match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`))?.[1];

/** the signed-in person, or null. The first visit of a day moves the 30 days forward (once a day, not once an hour:
 *  the free plan counts every row written). */
export async function currentUser(env: Env, req: Request): Promise<Me | null> {
  const token = tokenOf(req);
  if (!token) return null;
  const sid = await sha256(token);
  const r = await env.DB.prepare("SELECT s.user_id, s.last_seen_at, u.email FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ? AND s.expires_at > ?")
    .bind(sid, nowIso()).first<{ user_id: string; last_seen_at: string; email: string }>();
  if (!r) return null;
  if (Date.now() - Date.parse(r.last_seen_at) > 86_400_000) {
    const now = nowIso(), exp = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
    await env.DB.batch([
      env.DB.prepare("UPDATE sessions SET last_seen_at = ?, expires_at = ? WHERE id = ?").bind(now, exp, sid),
      env.DB.prepare("UPDATE users SET last_seen_at = ? WHERE id = ?").bind(now, r.user_id),
    ]);
  }
  return { id: r.user_id, email: r.email, sid };
}

// ---- codes ----
type CodeRow = { code_hash: string; created_at: string; expires_at: string; tries: number; proof_hash: string | null; sends: number; window_at: string | null };

/** send a 6-digit code; refuses politely when asked too often. `mail` is which of the four code mails carries it (the
 *  sign-up, sign-in and new-password codes share the "email" purpose: one code proves the address for all three) */
export async function sendCode(env: Env, email: string, purpose: "email" | "delete", lang: string, mail: "signup" | "signin" | "password" | "delete" = purpose === "delete" ? "delete" : "signin") {
  const row = await env.DB.prepare("SELECT * FROM codes WHERE email = ? AND purpose = ?").bind(email, purpose).first<CodeRow>();
  const now = Date.now();
  if (row && now - Date.parse(row.created_at) < RESEND_SECONDS * 1000) return { error: "wait", wait: Math.ceil((RESEND_SECONDS * 1000 - (now - Date.parse(row.created_at))) / 1000) };
  const inWindow = row?.window_at && now - Date.parse(row.window_at) < 3600000;
  const sends = inWindow ? row!.sends + 1 : 1;
  if (sends > CODES_PER_HOUR) return { error: "too_many" };
  const code = randomCode();
  const at = nowIso();
  await env.DB.prepare(`INSERT INTO codes (email, purpose, code_hash, created_at, expires_at, tries, proof_hash, sends, window_at) VALUES (?1, ?2, ?3, ?4, ?5, 0, NULL, ?6, ?7)
    ON CONFLICT(email, purpose) DO UPDATE SET code_hash = ?3, created_at = ?4, expires_at = ?5, tries = 0, proof_hash = NULL, sends = ?6, window_at = ?7`)
    .bind(email, purpose, await sha256(`${email}:${code}`), at, new Date(now + CODE_MINUTES * 60000).toISOString(), sends, inWindow ? row!.window_at : at).run();
  const sent = await sendDesigned(env, email, mail, { lang, code });
  return sent.ok ? { ok: true } : { error: "mail" };
}

/** check a code; a right one becomes a proof (returned once) good until the code would have expired */
export async function checkCode(env: Env, email: string, purpose: "email" | "delete", code: string) {
  const row = await env.DB.prepare("SELECT * FROM codes WHERE email = ? AND purpose = ?").bind(email, purpose).first<CodeRow>();
  if (!row || Date.parse(row.expires_at) < Date.now() || row.tries >= CODE_TRIES) return { error: "expired" as const };
  if (!/^\d{6}$/.test(code) || !same(row.code_hash, await sha256(`${email}:${code}`))) {
    await env.DB.prepare("UPDATE codes SET tries = tries + 1 WHERE email = ? AND purpose = ?").bind(email, purpose).run();
    return { error: row.tries + 1 >= CODE_TRIES ? ("expired" as const) : ("wrong" as const), left: CODE_TRIES - row.tries - 1 };
  }
  const proof = randomToken();
  await env.DB.prepare("UPDATE codes SET proof_hash = ?, tries = ? WHERE email = ? AND purpose = ?").bind(await sha256(proof), CODE_TRIES, email, purpose).run();
  return { proof };
}

async function useProof(env: Env, email: string, purpose: "email" | "delete", proof: string) {
  const row = await env.DB.prepare("SELECT proof_hash, expires_at FROM codes WHERE email = ? AND purpose = ?").bind(email, purpose).first<{ proof_hash: string | null; expires_at: string }>();
  if (!row?.proof_hash || Date.parse(row.expires_at) < Date.now() || !same(row.proof_hash, await sha256(proof))) return false;
  await env.DB.prepare("DELETE FROM codes WHERE email = ? AND purpose = ?").bind(email, purpose).run();
  return true;
}

// ---- sign-ups: the e-mail quota is shared by everyone, so new addresses may not use it all ----
/** sign-up codes, whole site: at most this many an hour, and none once today's mails reach the day's limit minus a
 *  reserve; people who already have an account (sign-in, new password, deletion) always keep the reserve */
const SIGNUP_CODES_PER_HOUR = 30;
const ACCOUNT_RESERVE = 15;
async function signupRoom(env: Env) {
  const day = dayTotal(env) - ACCOUNT_RESERVE;
  if ((await sentToday(env)) >= day) return false;
  const hour = await env.DB.prepare("SELECT COUNT(*) n FROM mail WHERE kind = 'signup' AND at >= ?").bind(new Date(Date.now() - 3600000).toISOString()).first<{ n: number }>();
  return Number(hour?.n ?? 0) < SIGNUP_CODES_PER_HOUR;
}

/** Turnstile (Cloudflare's free bot check) on sign-up codes, once TURNSTILE_SITEKEY and the TURNSTILE_SECRET secret are
 *  set; the answer must be for this action and one of our own addresses. Fails closed. */
export async function humanOk(env: Env, token: unknown, ip: string | null) {
  if (!env.TURNSTILE_SECRET || !env.TURNSTILE_SITEKEY) return true;
  if (typeof token !== "string" || !token || token.length > 2048) return false;
  const hosts = new Set((env.TURNSTILE_HOSTNAMES ?? "tcf.monster").split(",").map((h) => h.trim()).filter(Boolean));
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!r.ok) return false;
    const d = (await r.json()) as { success?: boolean; action?: string; hostname?: string; "error-codes"?: string[] };
    if (!d.success) console.log(`[turnstile] refused: ${(d["error-codes"] ?? []).join(",") || "no reason"}`);
    return d.success === true && d.action === "signup" && hosts.has(String(d.hostname));
  } catch { return false; }
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
  const hammering = (what: string, limit: number) => ip !== null && !rateLimit(`${what}:${ip}`, limit);

  if (path === "/auth/exists") {
    // the one door asks the e-mail first and then shows the right next step: this tells it which one. It says
    // whether an address has an account (the owner chose this behaviour over a blind form); the same per-address
    // limit as the codes keeps it from being a list checker, and a closed door answers before anything is told
    const email = cleanEmail(b.email);
    if (!email) return fail(400, "email");
    if (hammering("code", IP_CODES_PER_MIN)) return json({ error: "too_many" }, 429);
    const u = await env.DB.prepare("SELECT password IS NOT NULL has FROM users WHERE email = ?").bind(email).first<{ has: number }>();
    const exists = Boolean(u?.has);
    if (!exists && !mayJoin(env, email)) return json({ error: "closed" }, 403);
    // a new address will ask for a sign-up code: the page gets the bot check's public key when it is on
    return json(!exists && env.TURNSTILE_SITEKEY && env.TURNSTILE_SECRET ? { exists, turnstile: env.TURNSTILE_SITEKEY } : { exists });
  }

  if (path === "/auth/code") {
    const email = cleanEmail(b.email);
    if (!email) return fail(400, "email");
    if (hammering("code", IP_CODES_PER_MIN)) return json({ error: "too_many" }, 429);
    // a new account needs the door to be open; a forgotten password works for anyone who has an account
    const exists = await env.DB.prepare("SELECT password IS NOT NULL has FROM users WHERE email = ?").bind(email).first<{ has: number }>();
    if (!exists && !mayJoin(env, email)) return json({ error: "closed" }, 403);
    if (!exists?.has) {
      if (!(await humanOk(env, b.turnstile, ip))) return json({ error: "bot" }, 403);
      if (!(await signupRoom(env))) return json({ error: "busy" }, 429);
    }
    // which mail: no account yet is a sign-up; the page says whether an existing one signs in or sets a new password
    const mail = !exists?.has ? "signup" : b.why === "reset" || b.why === "password" ? "password" : "signin";
    const r = await sendCode(env, email, "email", b.lang === "fr" ? "fr" : "en", mail);
    return json(r, "error" in r ? (r.error === "mail" ? 502 : 429) : 200);
  }

  if (path === "/auth/signin-code") {
    // sign-in by the code alone (« send me a code instead »): the code proves the address, the account must exist
    const email = cleanEmail(b.email);
    if (!email) return fail(400, "email");
    if (hammering("try", IP_TRIES_PER_MIN)) return json({ error: "too_many" }, 429);
    const u = await env.DB.prepare("SELECT id FROM users WHERE email = ? AND password IS NOT NULL").bind(email).first<{ id: string }>();
    if (!u) return json({ error: "wrong" }, 400);
    const r = await checkCode(env, email, "email", String(b.code ?? ""));
    if ("error" in r) return json(r, 400);
    await env.DB.prepare("DELETE FROM codes WHERE email = ? AND purpose = 'email'").bind(email).run();
    await env.DB.prepare("UPDATE users SET failed_logins = 0, locked_until = NULL WHERE id = ?").bind(u.id).run();
    return json({ ok: true }, 200, { "set-cookie": await startSession(env, req, u.id) });
  }

  if (path === "/auth/verify") {
    const email = cleanEmail(b.email);
    if (!email) return fail(400, "email");
    if (hammering("try", IP_TRIES_PER_MIN)) return json({ error: "too_many" }, 429);
    const r = await checkCode(env, email, "email", String(b.code ?? ""));
    if ("error" in r) return json(r, 400);
    const u = await env.DB.prepare("SELECT password IS NOT NULL has FROM users WHERE email = ?").bind(email).first<{ has: number }>();
    return json({ proof: r.proof, exists: Boolean(u?.has) });
  }

  if (path === "/auth/password") {
    // new account (terms ticked) or a new password for an existing one, after a verified code
    const email = cleanEmail(b.email), pw = cleanStretched(b.password), proof = String(b.proof ?? "");
    if (!email || !pw || !proof) return fail(400, "fields");
    if (!(await useProof(env, email, "email", proof))) return json({ error: "expired" }, 400);
    const u = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first<{ id: string }>();
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
    const u = await env.DB.prepare("SELECT id, password, failed_logins, locked_until FROM users WHERE email = ?").bind(email)
      .first<{ id: string; password: string | null; failed_logins: number; locked_until: string | null }>();
    if (u?.locked_until && Date.parse(u.locked_until) > Date.now()) return json({ error: "locked", until: u.locked_until }, 429);
    if (!u?.password || !(await checkPassword(env, u.password, pw))) {
      if (u) {
        const fails = u.failed_logins + 1;
        const lock = fails >= LOGIN_FAILS ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : null;
        await env.DB.prepare("UPDATE users SET failed_logins = ?, locked_until = ? WHERE id = ?").bind(lock ? 0 : fails, lock, u.id).run();
        if (lock) return json({ error: "locked", until: lock }, 429);
      }
      return json({ error: "wrong" }, 400);
    }
    return json({ ok: true }, 200, { "set-cookie": await startSession(env, req, u.id) });
  }

  if (path === "/auth/logout") {
    const token = tokenOf(req);
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": sessionCookie(req, "", 0) });
  }

  return fail(404, "not found");
}
