// E-mail through Resend, with Brevo as the backup. Every send is logged in `mail` (the admin's Jobs page counts them).
// Free plans: Resend sends 100 a day (3 000 a month), Brevo 300 a day. Resend goes first; once it has sent its 100 today,
// or refuses (its month is used up, or it is down), the mail goes through Brevo when BREVO_API_KEY is set.
// Codes always go; the other mails (welcome, exam) stop at newsCap() sent today, so codes keep room, and wait for the
// next night.
import { type Env, nowIso } from "./util.ts";
import { pepper } from "./auth.ts";
import { type MailId, type Lang, renderMail, STOPPABLE, SITE } from "./mails.ts";

export type MailKind = "signup" | "signin" | "reset" | "delete" | "deleted" | "welcome" | "luck" | "after" | "test";
export const RESEND_DAY = 100;
export const BREVO_DAY = 300;
/** every e-mail the free plans send in a day: Resend's 100, plus Brevo's 300 when the backup is set */
export const dayTotal = (env: Env) => RESEND_DAY + (env.BREVO_API_KEY ? BREVO_DAY : 0);
/** the last 50 of the day are for codes only: the welcome and exam mails stop there (and wait for the next night) */
export const CODES_ONLY = 50;
export const newsCap = (env: Env) => dayTotal(env) - CODES_ONLY;

export const mailReady = (env: Env) => Boolean(env.MAIL_FROM && (env.RESEND_API_KEY || env.BREVO_API_KEY));

type Out = { ok: boolean; detail: string; full?: boolean };
async function viaResend(env: Env, to: string, subject: string, html: string, text: string, headers?: Record<string, string>): Promise<Out> {
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, html, text, ...(headers ? { headers } : {}) }),
    });
    if (r.ok) return { ok: true, detail: "" };
    return { ok: false, detail: `HTTP ${r.status} ${(await r.text()).slice(0, 200)}`, full: r.status === 429 || r.status >= 500 };
  } catch (e) {
    return { ok: false, detail: String((e as Error).message ?? e).slice(0, 200), full: true };
  }
}
async function viaBrevo(env: Env, to: string, subject: string, html: string, text: string, headers?: Record<string, string>): Promise<Out> {
  const m = /^\s*(.*?)\s*<([^>]+)>\s*$/.exec(env.MAIL_FROM ?? "");
  const sender = m ? { name: m[1] || "tcf.monster", email: m[2] } : { name: "tcf.monster", email: String(env.MAIL_FROM) };
  try {
    const r = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": String(env.BREVO_API_KEY), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ sender, to: [{ email: to }], subject, htmlContent: html, textContent: text, ...(headers ? { headers } : {}) }),
    });
    if (r.ok) return { ok: true, detail: "brevo" };
    return { ok: false, detail: `brevo HTTP ${r.status} ${(await r.text()).slice(0, 180)}` };
  } catch (e) {
    return { ok: false, detail: `brevo ${String((e as Error).message ?? e).slice(0, 180)}` };
  }
}

/** mails Resend accepted since midnight UTC (Brevo's are logged with detail "brevo") */
async function resendToday(env: Env) {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM mail WHERE at >= ? AND ok = 1 AND detail IS NULL").bind(nowIso().slice(0, 10)).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

export async function sendMail(env: Env, to: string, kind: MailKind, subject: string, html: string, text: string, headers?: Record<string, string>, net: string | null = null) {
  if (!mailReady(env)) return { ok: false, detail: "no mail provider or sender set" };
  let out: Out = { ok: false, detail: "Resend not set", full: true };
  if (env.RESEND_API_KEY && (!env.BREVO_API_KEY || (await resendToday(env)) < RESEND_DAY)) out = await viaResend(env, to, subject, html, text, headers);
  else if (env.RESEND_API_KEY) out = { ok: false, detail: "Resend's day is used up", full: true };
  if (!out.ok && out.full && env.BREVO_API_KEY) {
    const first = out.detail;
    out = await viaBrevo(env, to, subject, html, text, headers);
    if (!out.ok) out.detail = `${first.slice(0, 80)} · ${out.detail}`;
  }
  await env.DB.prepare("INSERT INTO mail (at, email, kind, ok, detail, ip) VALUES (?, ?, ?, ?, ?, ?)").bind(nowIso(), to, kind, out.ok ? 1 : 0, out.detail || null, net).run();
  return { ok: out.ok, detail: out.detail };
}

/** e-mails sent since midnight UTC (Resend counts its day in UTC) */
export async function sentToday(env: Env) {
  const r = await env.DB.prepare("SELECT COUNT(*) n FROM mail WHERE at >= ?").bind(nowIso().slice(0, 10)).first<{ n: number }>();
  return Number(r?.n ?? 0);
}

// ---- the stop link: signed with the pepper, so nobody can stop someone else's mails ----
const enc = new TextEncoder();
export async function stopToken(env: Env, userId: string) {
  const k = await crypto.subtle.importKey("raw", enc.encode(pepper(env)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(`stop-mails:${userId}`));
  return [...new Uint8Array(sig)].slice(0, 16).map((x) => x.toString(16).padStart(2, "0")).join("");
}
export async function stopUrl(env: Env, userId: string) {
  return `${SITE}/api/mail/stop?u=${encodeURIComponent(userId)}&t=${await stopToken(env, userId)}`;
}

const KIND: Record<MailId, MailKind> = { signup: "signup", signin: "signin", password: "reset", delete: "delete", deleted: "deleted", welcome: "welcome", luck: "luck", after: "after" };

/** one of the designed mails to one person; the stoppable ones carry the stop link and the one-click headers */
export async function sendDesigned(env: Env, to: string, id: MailId, who: { lang: string; userId?: string; name?: string | null; code?: string; examDate?: string; examToday?: boolean; net?: string | null }) {
  const lang: Lang = who.lang === "en" ? "en" : "fr";
  const stop = STOPPABLE.includes(id) && who.userId ? await stopUrl(env, who.userId) : undefined;
  const m = renderMail(id, { lang, name: who.name, code: who.code, examDate: who.examDate, examToday: who.examToday, stopUrl: stop });
  if (!mailReady(env) && env.MAIL_LOG === "1" && env.LOCAL_DEV === "1") { console.log(`[mail] ${to} ${id}${who.code ? " code " + who.code : ""}`); return { ok: true, detail: "logged" }; }
  const headers = stop ? { "List-Unsubscribe": `<${stop}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } : undefined;
  return sendMail(env, to, KIND[id], m.subject, m.html, m.text, headers, who.net ?? null);
}

/** settings.mails === false: the person stopped the welcome and exam mails */
export function mailsOff(settings: unknown) {
  try { return (typeof settings === "string" ? JSON.parse(settings) : settings)?.mails === false; } catch { return false; }
}
